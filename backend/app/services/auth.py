"""Token verification, guest minting, and the claim flow.

Two token shapes resolve to a `users` row:
- registered: Supabase Auth JWT; sub -> users.auth_user_id
- guest: minted here, signed with the same secret so Realtime and RLS accept
  it; sub -> users.id directly, valid for exactly one game_id.
"""

import logging
import secrets
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

import jwt
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.errors import AppError, guest_not_permitted, not_found
from app.models import Game, GameMember, GameState, MemberRole, User

logger = logging.getLogger(__name__)

# Auth server and API can sit on different clocks (locally: the Docker VM
# runs ahead of the host). A fresh token with iat a second in the future is
# valid, not an attack; without leeway every first request after sign-up 401s.
CLOCK_LEEWAY_SECONDS = 30

# No 0/O/1/I — codes get read aloud across a kitchen table.
JOIN_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


@dataclass
class Principal:
    user: User
    is_guest: bool
    token_game_id: uuid.UUID | None

    def require_registered(self) -> None:
        if self.is_guest:
            raise guest_not_permitted()

    def require_game_scope(self, game_id: uuid.UUID) -> None:
        """A guest token names one game and is valid for nothing else."""
        if self.is_guest and self.token_game_id != game_id:
            raise guest_not_permitted()


def generate_join_code() -> str:
    return "".join(secrets.choice(JOIN_CODE_ALPHABET) for _ in range(6))


_jwk_client: jwt.PyJWKClient | None = None


def _jwks() -> jwt.PyJWKClient:
    global _jwk_client
    if _jwk_client is None:
        _jwk_client = jwt.PyJWKClient(
            f"{get_settings().supabase_url}/auth/v1/.well-known/jwks.json",
            cache_keys=True,
        )
    return _jwk_client


def decode_token(token: str) -> dict:
    """Two signature schemes reach us: HS256 with the legacy shared secret
    (our own guest tokens, and legacy Supabase access tokens), and the
    asymmetric keys newer Supabase Auth signs with, verified via JWKS."""
    try:
        header = jwt.get_unverified_header(token)
        if header.get("alg") == "HS256":
            if not get_settings().hs256_available:
                # production without a real shared secret: an HS256 token
                # could have been signed by anyone — never accept it
                logger.warning("token refused: HS256 disabled (dev secret in production)")
                raise AppError("invalid_token", 401)
            return jwt.decode(
                token,
                get_settings().supabase_jwt_secret,
                algorithms=["HS256"],
                audience="authenticated",
                leeway=CLOCK_LEEWAY_SECONDS,
            )
        signing_key = _jwks().get_signing_key_from_jwt(token)
        return jwt.decode(
            token,
            signing_key.key,
            algorithms=["ES256", "RS256"],
            audience="authenticated",
            leeway=CLOCK_LEEWAY_SECONDS,
        )
    except (jwt.InvalidTokenError, jwt.PyJWKClientError) as exc:
        # visible in the server log: a refused token is worth a line, the
        # token itself never is
        logger.warning("token refused: %s: %s", type(exc).__name__, exc)
        raise AppError("invalid_token", 401)


def resolve_principal(session: Session, token: str) -> Principal:
    claims = decode_token(token)
    sub = claims.get("sub")
    if not sub:
        raise AppError("invalid_token", 401)

    if claims.get("fish_guest"):
        user = session.get(User, uuid.UUID(sub))
        if user is None:
            raise AppError("invalid_token", 401)
        game_id = claims.get("game_id")
        if not game_id:
            raise AppError("invalid_token", 401)
        return Principal(user=user, is_guest=True, token_game_id=uuid.UUID(game_id))

    auth_id = uuid.UUID(sub)
    user = session.execute(
        select(User).where(User.auth_user_id == auth_id)
    ).scalar_one_or_none()
    if user is None:
        # The on_auth_user_created trigger normally creates this row; the
        # first authenticated call is the fallback the backend skill allows.
        email = claims.get("email") or ""
        meta = claims.get("user_metadata") or {}
        display_name = meta.get("display_name") or email.split("@")[0] or "player"
        user = User(
            auth_user_id=auth_id, display_name=display_name[:60], is_guest=False
        )
        session.add(user)
        session.flush()
    return Principal(user=user, is_guest=False, token_game_id=None)


def mint_guest_token(user_id: uuid.UUID, game_id: uuid.UUID) -> tuple[str, datetime]:
    settings = get_settings()
    expires = datetime.now(timezone.utc) + timedelta(hours=settings.guest_token_ttl_hours)
    token = jwt.encode(
        {
            "sub": str(user_id),
            "aud": "authenticated",
            "role": "authenticated",
            "fish_guest": True,
            "game_id": str(game_id),
            "exp": expires,
        },
        settings.supabase_jwt_secret,
        algorithm="HS256",
    )
    return token, expires


def guest_join(
    session: Session, join_code: str, display_name: str
) -> tuple[User, Game, str, datetime]:
    game = session.execute(
        select(Game).where(Game.join_code == join_code.upper())
    ).scalar_one_or_none()
    if game is None:
        raise not_found("game")
    if game.state not in (GameState.open, GameState.running):
        raise AppError("game_not_joinable", 409, {"state": game.state.value})
    if not get_settings().hs256_available:
        # guest tokens are HS256; without the real secret they'd be both
        # forgeable and refused by Supabase RLS/Realtime
        raise AppError("guest_unavailable", 503)

    user = User(display_name=display_name, is_guest=True)
    session.add(user)
    session.flush()
    session.add(GameMember(game_id=game.id, user_id=user.id, role=MemberRole.player))
    token, expires = mint_guest_token(user.id, game.id)
    return user, game, token, expires


def refresh_guest_token(session: Session, principal: Principal) -> tuple[str, datetime]:
    if not principal.is_guest or principal.token_game_id is None:
        raise AppError("invalid_token", 401)
    game = session.get(Game, principal.token_game_id)
    if game is None:
        raise not_found("game")
    if game.state == GameState.closed:
        raise AppError("game_closed", 409)
    return mint_guest_token(principal.user.id, game.id)


def claim_guest(session: Session, registered: Principal, guest_token: str) -> User:
    """Repoint the guest row at the new identity. The row is the same row —
    entries never move between users; it just gains an identity."""
    registered.require_registered()

    claims = decode_token(guest_token)
    if not claims.get("fish_guest") or not claims.get("sub"):
        raise AppError("invalid_token", 401)
    guest = session.get(User, uuid.UUID(claims["sub"]))
    if guest is None or not guest.is_guest:
        raise AppError("invalid_token", 401)
    game_id = uuid.UUID(claims["game_id"])

    already_member = session.get(GameMember, (game_id, registered.user.id))
    if already_member is not None:
        raise AppError("claim_target_in_game", 409)

    # One auth identity maps to one ledger row. The registered sign-up already
    # created a row via trigger; it can only be discarded if it holds nothing.
    has_history = (
        session.execute(
            select(GameMember.game_id).where(GameMember.user_id == registered.user.id).limit(1)
        ).first()
        is not None
    )
    if has_history:
        raise AppError("claim_target_has_history", 409)

    auth_id = registered.user.auth_user_id
    session.delete(registered.user)
    session.flush()
    guest.auth_user_id = auth_id
    guest.is_guest = False
    session.flush()
    return guest
