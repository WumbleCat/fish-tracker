import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.errors import (
    AppError,
    invalid_state_transition,
    not_found,
    not_host,
    not_member,
    pending_entries_block_close,
    reconciliation_mismatch,
    version_conflict,
)
from app.models import (
    Entry,
    EntryState,
    EntryType,
    Game,
    GameEvent,
    GameEventType,
    GameMember,
    GameState,
    MemberRole,
    Settlement,
    User,
)
from app.services.auth import Principal, generate_join_code
from app.services.seats import require_seat
from app.services.settlement import settle

# ISO 4217 minor-unit exponents that differ from the common case. Never a
# hard-coded 2 at a use site: exponent always comes from this metadata at
# creation and from the game row everywhere else.
_CURRENCY_EXPONENTS = {
    "BHD": 3, "IQD": 3, "JOD": 3, "KWD": 3, "LYD": 3, "OMR": 3, "TND": 3,
    "BIF": 0, "CLP": 0, "DJF": 0, "GNF": 0, "ISK": 0, "JPY": 0, "KMF": 0,
    "KRW": 0, "PYG": 0, "RWF": 0, "UGX": 0, "VND": 0, "VUV": 0, "XAF": 0,
    "XOF": 0, "XPF": 0,
}
_DEFAULT_EXPONENT = 2

_ALLOWED_TRANSITIONS: dict[GameState, set[GameState]] = {
    GameState.draft: {GameState.open, GameState.abandoned},
    GameState.open: {GameState.running, GameState.abandoned},
    GameState.running: {GameState.settling, GameState.abandoned},
    # "one more orbit" always happens
    GameState.settling: {GameState.running, GameState.abandoned},
    GameState.closed: set(),
    GameState.abandoned: set(),
}


def currency_exponent_for(currency: str) -> int:
    return _CURRENCY_EXPONENTS.get(currency, _DEFAULT_EXPONENT)


def load_member_game(
    session: Session, principal: Principal, game_id: uuid.UUID, *, for_update: bool = False
) -> Game:
    principal.require_game_scope(game_id)
    stmt = select(Game).where(Game.id == game_id)
    if for_update:
        stmt = stmt.with_for_update()
    game = session.execute(stmt).scalar_one_or_none()
    if game is None:
        raise not_found("game")
    member = session.get(GameMember, (game_id, principal.user.id))
    if member is None:
        raise not_member()
    return game


def require_host(session: Session, principal: Principal, game: Game) -> None:
    if principal.is_guest:
        # Guests are never hosts; distinct code so clients can phrase it.
        raise AppError("guest_not_permitted", 403)
    if game.host_id != principal.user.id:
        raise not_host()


def _check_game_version(game: Game, if_version: int | None) -> None:
    if if_version is not None and if_version != game.version:
        raise version_conflict({"id": str(game.id), "version": game.version,
                                "state": game.state.value})


def create_game(
    session: Session,
    principal: Principal,
    name: str,
    currency: str,
    currency_exponent: int | None,
    stake_minor: int | None,
    small_blind_minor: int | None = None,
    big_blind_minor: int | None = None,
) -> Game:
    principal.require_registered()
    exponent = (
        currency_exponent
        if currency_exponent is not None
        else currency_exponent_for(currency)
    )
    join_code = generate_join_code()
    while session.execute(
        select(Game.id).where(Game.join_code == join_code)
    ).first() is not None:
        join_code = generate_join_code()

    game = Game(
        name=name,
        join_code=join_code,
        state=GameState.draft,
        host_id=principal.user.id,
        currency=currency,
        currency_exponent=exponent,
        stake_minor=stake_minor,
        small_blind_minor=small_blind_minor,
        big_blind_minor=big_blind_minor,
    )
    session.add(game)
    session.flush()
    session.add(
        GameMember(game_id=game.id, user_id=principal.user.id, role=MemberRole.host)
    )
    session.flush()
    return game


def list_my_games(session: Session, principal: Principal) -> list[tuple[Game, GameMember]]:
    rows = session.execute(
        select(Game, GameMember)
        .join(GameMember, GameMember.game_id == Game.id)
        .where(GameMember.user_id == principal.user.id)
        .order_by(Game.created_at.desc())
    ).all()
    if principal.is_guest:
        rows = [r for r in rows if r[0].id == principal.token_game_id]
    return [(g, m) for g, m in rows]


def join_game(session: Session, principal: Principal, join_code: str) -> Game:
    principal.require_registered()
    game = session.execute(
        select(Game).where(Game.join_code == join_code.upper())
    ).scalar_one_or_none()
    if game is None:
        raise not_found("game")
    if game.state not in (GameState.open, GameState.running):
        raise AppError("game_not_joinable", 409, {"state": game.state.value})

    member = session.get(GameMember, (game.id, principal.user.id))
    if member is not None and member.departed_at is None:
        # already seated — joining again is a no-op, not a second seat
        return game
    require_seat(session, game.id)
    if member is not None:
        # Rejoining after leaving is normal; membership resumes.
        member.departed_at = None
        member.departed_unsettled = False
    else:
        session.add(
            GameMember(game_id=game.id, user_id=principal.user.id, role=MemberRole.player)
        )
    session.flush()
    return game


def add_player(
    session: Session, principal: Principal, game_id: uuid.UUID, display_name: str
) -> User:
    """Seat someone who is not using the app (app-logic, 2026-08-28).

    A guest-kind row with no token: the host logs its entries, and the
    absence of a credential is what makes it host-managed. No token also
    means no claim path — claiming needs the guest token this row will never
    have — so unlike guest_join this does not require HS256 to be available.
    """
    game = load_member_game(session, principal, game_id, for_update=True)
    require_host(session, principal, game)
    if game.state not in (GameState.open, GameState.running):
        raise AppError("game_not_joinable", 409, {"state": game.state.value})
    require_seat(session, game.id)

    player = User(display_name=display_name.strip(), is_guest=True)
    session.add(player)
    session.flush()
    session.add(
        GameMember(game_id=game.id, user_id=player.id, role=MemberRole.player)
    )
    session.flush()
    return player


def game_entries(session: Session, game_id: uuid.UUID) -> list[Entry]:
    return list(
        session.execute(
            select(Entry).where(Entry.game_id == game_id).order_by(Entry.created_at)
        ).scalars()
    )


def compute_positions(entries: list[Entry]) -> dict:
    """The two totals, per app-logic. Pending never merges into a net."""
    settleable: dict[uuid.UUID, int] = {}
    pending_delta: dict[uuid.UUID, int] = {}
    pending_count: dict[uuid.UUID, int] = {}
    verified_buy_ins = 0
    verified_cash_outs = 0
    chips_on_table = 0
    total_pending = 0

    for e in entries:
        sign = 1 if e.entry_type == EntryType.cash_out else -1
        if e.state == EntryState.verified:
            settleable[e.user_id] = settleable.get(e.user_id, 0) + sign * e.amount_minor
            if e.entry_type == EntryType.cash_out:
                verified_cash_outs += e.amount_minor
                chips_on_table -= e.amount_minor
            else:
                verified_buy_ins += e.amount_minor
                chips_on_table += e.amount_minor
        elif e.state == EntryState.pending:
            pending_delta[e.user_id] = (
                pending_delta.get(e.user_id, 0) + sign * e.amount_minor
            )
            pending_count[e.user_id] = pending_count.get(e.user_id, 0) + 1
            total_pending += 1
            chips_on_table += -e.amount_minor if e.entry_type == EntryType.cash_out else e.amount_minor
        # rejected and void entries count toward nothing

    return {
        "settleable": settleable,
        "pending_delta": pending_delta,
        "pending_count": pending_count,
        "verified_buy_ins": verified_buy_ins,
        "verified_cash_outs": verified_cash_outs,
        "chips_on_table": chips_on_table,
        "total_pending": total_pending,
    }


def game_members_with_users(
    session: Session, game_id: uuid.UUID
) -> list[tuple[GameMember, User]]:
    return [
        (m, u)
        for m, u in session.execute(
            select(GameMember, User)
            .join(User, User.id == GameMember.user_id)
            .where(GameMember.game_id == game_id)
            .order_by(GameMember.joined_at)
        ).all()
    ]


def change_state(
    session: Session,
    principal: Principal,
    game_id: uuid.UUID,
    to: GameState,
    if_version: int | None,
) -> Game:
    game = load_member_game(session, principal, game_id, for_update=True)
    require_host(session, principal, game)
    _check_game_version(game, if_version)
    if to == GameState.closed:
        # Closing runs the settlement gates; it is its own endpoint.
        raise invalid_state_transition(game.state.value, to.value)
    if to not in _ALLOWED_TRANSITIONS[game.state]:
        raise invalid_state_transition(game.state.value, to.value)
    game.state = to
    game.version += 1
    session.flush()
    return game


def transfer_host(
    session: Session,
    principal: Principal,
    game_id: uuid.UUID,
    new_host_id: uuid.UUID,
    if_version: int | None,
) -> Game:
    game = load_member_game(session, principal, game_id, for_update=True)
    require_host(session, principal, game)
    _check_game_version(game, if_version)
    if game.state in (GameState.closed, GameState.abandoned):
        raise AppError("game_closed", 409)

    target_member = session.get(GameMember, (game_id, new_host_id))
    target_user = session.get(User, new_host_id)
    if target_member is None or target_user is None or target_member.departed_at is not None:
        raise not_found("user")
    if target_user.is_guest:
        # Guests are never eligible, including via transfer.
        raise AppError("guest_not_permitted", 403)

    old_member = session.get(GameMember, (game_id, game.host_id))
    if old_member is not None:
        old_member.role = MemberRole.player
    target_member.role = MemberRole.host
    game.host_id = new_host_id
    game.version += 1
    session.flush()
    return game


def _position_settled(entries: list[Entry], user_id: uuid.UUID) -> bool:
    """Settled = no pending entries, and any sitting is closed out: the last
    verified entry, if any exist, is a cash-out."""
    mine = [e for e in entries if e.user_id == user_id]
    if any(e.state == EntryState.pending for e in mine):
        return False
    verified = sorted(
        (e for e in mine if e.state == EntryState.verified), key=lambda e: e.created_at
    )
    if not verified:
        return True
    return verified[-1].entry_type == EntryType.cash_out


def leave_game(
    session: Session, principal: Principal, game_id: uuid.UUID
) -> GameMember:
    game = load_member_game(session, principal, game_id, for_update=True)
    if game.host_id == principal.user.id:
        # The host transfers first; a hostless game can't be closed.
        raise AppError("host_must_transfer_first", 409)
    member = session.get(GameMember, (game_id, principal.user.id))
    entries = game_entries(session, game_id)
    settled = _position_settled(entries, principal.user.id)
    member.departed_at = datetime.now(timezone.utc)
    member.departed_unsettled = not settled
    session.flush()
    return member


def remove_member(
    session: Session,
    principal: Principal,
    game_id: uuid.UUID,
    user_id: uuid.UUID,
) -> GameMember:
    game = load_member_game(session, principal, game_id, for_update=True)
    require_host(session, principal, game)
    if user_id == game.host_id:
        raise AppError("host_must_transfer_first", 409)
    member = session.get(GameMember, (game_id, user_id))
    if member is None:
        raise not_found("user")
    entries = game_entries(session, game_id)
    settled = _position_settled(entries, user_id)
    member.departed_at = datetime.now(timezone.utc)
    member.departed_unsettled = not settled
    session.flush()
    return member


def change_currency(
    session: Session,
    principal: Principal,
    game_id: uuid.UUID,
    currency: str,
    currency_exponent: int | None,
    if_version: int | None,
) -> Game:
    game = load_member_game(session, principal, game_id, for_update=True)
    require_host(session, principal, game)
    _check_game_version(game, if_version)
    if game.state not in (GameState.draft, GameState.open):
        raise AppError("currency_locked", 409)
    if session.execute(
        select(Entry.id).where(Entry.game_id == game_id).limit(1)
    ).first() is not None:
        # The DB trigger backs this; catching it here gives the client a
        # structured code instead of a constraint error.
        raise AppError("currency_locked", 409)
    game.currency = currency
    game.currency_exponent = (
        currency_exponent
        if currency_exponent is not None
        else currency_exponent_for(currency)
    )
    game.version += 1
    session.flush()
    return game


def game_events(session: Session, game_id: uuid.UUID) -> list[GameEvent]:
    """Read-only companion to game_entries. Nothing downstream sums these."""
    return list(
        session.execute(
            select(GameEvent)
            .where(GameEvent.game_id == game_id)
            .order_by(GameEvent.created_at)
        ).scalars()
    )


def set_blinds(
    session: Session,
    principal: Principal,
    game_id: uuid.UUID,
    small_blind_minor: int,
    big_blind_minor: int,
    if_version: int | None,
) -> Game:
    """Host-only, allowed at any point before the game is finished. Home
    games raise the stakes mid-session; refusing that would only mean the
    ledger disagreed with the table (app-logic, 2026-08-26).

    The blinds are not ledger money — nothing here touches an entry, a net or
    a total. The change is recorded as a game event so the log can answer
    "what were we playing at 21:04", which is the question people ask.
    """
    game = load_member_game(session, principal, game_id, for_update=True)
    require_host(session, principal, game)
    _check_game_version(game, if_version)
    if game.state in (GameState.closed, GameState.abandoned):
        raise AppError("game_finished", 409, {"state": game.state.value})
    if big_blind_minor < small_blind_minor:
        raise AppError("blinds_invalid", 422, {"reason": "big blind is below small blind"})

    unchanged = (
        game.small_blind_minor == small_blind_minor
        and game.big_blind_minor == big_blind_minor
    )
    if unchanged:
        # A no-op write would put a "changed" row in the log that records no
        # change. Return the game untouched instead.
        return game

    session.add(
        GameEvent(
            game_id=game.id,
            event_type=GameEventType.blinds_changed,
            actor_user_id=principal.user.id,
            from_small_blind_minor=game.small_blind_minor,
            from_big_blind_minor=game.big_blind_minor,
            to_small_blind_minor=small_blind_minor,
            to_big_blind_minor=big_blind_minor,
        )
    )
    game.small_blind_minor = small_blind_minor
    game.big_blind_minor = big_blind_minor
    game.version += 1
    session.flush()
    return game


def compute_settlement_inputs(entries: list[Entry]) -> tuple[dict[uuid.UUID, int], int]:
    """(nets, discrepancy) from verified entries only."""
    positions = compute_positions(entries)
    nets = positions["settleable"]
    discrepancy = positions["verified_buy_ins"] - positions["verified_cash_outs"]
    return nets, discrepancy


def close_game(
    session: Session,
    principal: Principal,
    game_id: uuid.UUID,
    acknowledge_discrepancy: bool,
    if_version: int | None,
) -> tuple[Game, Settlement]:
    # The row lock is what stops two hosts producing two settlements.
    game = load_member_game(session, principal, game_id, for_update=True)
    require_host(session, principal, game)
    _check_game_version(game, if_version)
    if game.state != GameState.settling:
        raise invalid_state_transition(game.state.value, GameState.closed.value)

    entries = game_entries(session, game_id)
    pending = sum(1 for e in entries if e.state == EntryState.pending)
    if pending:
        # The most important gate in the system.
        raise pending_entries_block_close(pending)

    nets, discrepancy = compute_settlement_inputs(entries)
    if discrepancy != 0 and not acknowledge_discrepancy:
        raise reconciliation_mismatch(discrepancy)

    payments = settle(nets, discrepancy_minor=discrepancy)
    now = datetime.now(timezone.utc)
    settlement = Settlement(
        game_id=game.id,
        computed_at=now,
        payments=[
            {
                "from_user": str(p.from_user),
                "to_user": str(p.to_user),
                "amount_minor": p.amount_minor,
            }
            for p in payments
        ],
        discrepancy_minor=discrepancy,
        acknowledged_by=principal.user.id if discrepancy != 0 else None,
    )
    session.add(settlement)
    game.state = GameState.closed
    game.closed_at = now
    game.version += 1
    session.flush()
    return game, settlement


def get_settlement_view(
    session: Session, principal: Principal, game_id: uuid.UUID
) -> dict:
    game = load_member_game(session, principal, game_id)
    if game.state == GameState.closed:
        stored = session.execute(
            select(Settlement).where(Settlement.game_id == game_id)
        ).scalar_one()
        nets, _ = compute_settlement_inputs(game_entries(session, game_id))
        return {
            "final": True,
            "computed_at": stored.computed_at,
            "payments": stored.payments,
            "discrepancy_minor": stored.discrepancy_minor,
            "acknowledged_by": stored.acknowledged_by,
            "needs_acknowledgement": False,
            "pending_count": 0,
            "nets": nets,
        }

    entries = game_entries(session, game_id)
    pending = sum(1 for e in entries if e.state == EntryState.pending)
    nets, discrepancy = compute_settlement_inputs(entries)
    payments = settle(nets, discrepancy_minor=discrepancy)
    return {
        "final": False,
        "computed_at": None,
        "payments": [
            {
                "from_user": p.from_user,
                "to_user": p.to_user,
                "amount_minor": p.amount_minor,
            }
            for p in payments
        ],
        "discrepancy_minor": discrepancy,
        "acknowledged_by": None,
        "needs_acknowledgement": discrepancy != 0,
        "pending_count": pending,
        "nets": nets,
    }
