from fastapi import APIRouter

from app.deps import CurrentPrincipal, DbSession
from app.schemas.auth import ClaimRequest, GuestJoinRequest, GuestTokenResponse
from app.schemas.users import UserOut
from app.services import auth as auth_service

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/guest", response_model=GuestTokenResponse)
def guest_join(body: GuestJoinRequest, session: DbSession):
    user, game, token, expires = auth_service.guest_join(
        session, body.join_code, body.display_name
    )
    return GuestTokenResponse(
        token=token, user_id=user.id, game_id=game.id, expires_at=expires
    )


@router.post("/guest/refresh", response_model=GuestTokenResponse)
def guest_refresh(session: DbSession, principal: CurrentPrincipal):
    token, expires = auth_service.refresh_guest_token(session, principal)
    return GuestTokenResponse(
        token=token,
        user_id=principal.user.id,
        game_id=principal.token_game_id,
        expires_at=expires,
    )


@router.post("/claim", response_model=UserOut)
def claim(body: ClaimRequest, session: DbSession, principal: CurrentPrincipal):
    return auth_service.claim_guest(session, principal, body.guest_token)
