import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.errors import (
    AppError,
    cashout_already_live,
    entry_not_rejected,
    not_found,
    version_conflict,
)
from app.models import Entry, EntryState, EntryType, Game, GameMember, GameState
from app.services import notify
from app.services.auth import Principal
from app.services.games import load_member_game, require_host


def _check_entry_version(entry: Entry, if_version: int | None) -> None:
    if if_version is not None and if_version != entry.version:
        raise version_conflict(
            {
                "id": str(entry.id),
                "state": entry.state.value,
                "amount_minor": entry.amount_minor,
                "version": entry.version,
            }
        )


def _load_entry_game(
    session: Session, principal: Principal, entry_id: uuid.UUID
) -> tuple[Entry, Game]:
    entry = session.get(Entry, entry_id)
    if entry is None:
        raise not_found("entry")
    game = load_member_game(session, principal, entry.game_id, for_update=True)
    return entry, game


def _require_live_game(game: Game, allowed: tuple[GameState, ...]) -> None:
    if game.state in (GameState.closed, GameState.abandoned):
        raise AppError("game_closed", 409)
    if game.state not in allowed:
        raise AppError(
            "invalid_state_transition", 409, {"from": game.state.value}
        )


def _cashout_slot_check(
    session: Session,
    game_id: uuid.UUID,
    user_id: uuid.UUID,
    *,
    exclude_entry_id: uuid.UUID | None = None,
) -> None:
    """A player holds at most one live cash-out. Pending: at most one (the
    partial index backs this). Verified: allowed only when a later verified
    buy-in or rebuy has opened a fresh sitting (decided 2026-08-23)."""
    pending = session.execute(
        select(Entry.id).where(
            Entry.game_id == game_id,
            Entry.user_id == user_id,
            Entry.entry_type == EntryType.cash_out,
            Entry.state == EntryState.pending,
        )
    ).scalars().all()
    if any(pid != exclude_entry_id for pid in pending):
        raise cashout_already_live()

    latest_cashout = session.execute(
        select(Entry)
        .where(
            Entry.game_id == game_id,
            Entry.user_id == user_id,
            Entry.entry_type == EntryType.cash_out,
            Entry.state == EntryState.verified,
        )
        .order_by(Entry.created_at.desc())
        .limit(1)
    ).scalar_one_or_none()
    if latest_cashout is not None:
        reopened = session.execute(
            select(Entry.id)
            .where(
                Entry.game_id == game_id,
                Entry.user_id == user_id,
                Entry.entry_type.in_([EntryType.buy_in, EntryType.rebuy]),
                Entry.state == EntryState.verified,
                Entry.created_at > latest_cashout.created_at,
            )
            .limit(1)
        ).first()
        if reopened is None:
            raise cashout_already_live()


def log_entry(
    session: Session,
    principal: Principal,
    game_id: uuid.UUID,
    entry_type: EntryType,
    amount_minor: int,
    target_user_id: uuid.UUID | None,
    client_key: uuid.UUID | None = None,
) -> Entry:
    game = load_member_game(session, principal, game_id, for_update=True)

    user_id = target_user_id or principal.user.id
    if user_id != principal.user.id:
        # "Just put me down for another twenty" — the host logging on a
        # player's behalf. The entry belongs to the player; the action to
        # whoever performed it.
        require_host(session, principal, game)
        member = session.get(GameMember, (game_id, user_id))
        if member is None or member.departed_at is not None:
            raise not_found("user")

    if client_key is not None:
        # The mobile offline queue replays inserts on reconnect; the same
        # key must collapse onto the original row, not log a second buy-in.
        existing = session.execute(
            select(Entry).where(
                Entry.game_id == game_id,
                Entry.user_id == user_id,
                Entry.client_key == client_key,
            )
        ).scalar_one_or_none()
        if existing is not None:
            return existing

    if entry_type == EntryType.cash_out:
        _require_live_game(game, (GameState.running, GameState.settling))
        _cashout_slot_check(session, game_id, user_id)
    else:
        _require_live_game(game, (GameState.running,))

    entry = Entry(
        game_id=game_id,
        user_id=user_id,
        entry_type=entry_type,
        amount_minor=amount_minor,
        state=EntryState.pending,
        logged_by=principal.user.id,
        client_key=client_key,
    )
    session.add(entry)
    try:
        session.flush()
    except IntegrityError:
        # a concurrent replay won the race; the unique index is the backstop
        session.rollback()
        existing = session.execute(
            select(Entry).where(
                Entry.game_id == game_id,
                Entry.user_id == user_id,
                Entry.client_key == client_key,
            )
        ).scalar_one_or_none()
        if existing is not None:
            return existing
        raise

    if game.host_id != principal.user.id:
        pending_count = session.execute(
            select(Entry.id).where(
                Entry.game_id == game_id, Entry.state == EntryState.pending
            )
        ).scalars().all()
        title, body = notify.build_pending_entry_notification(
            principal.user.display_name, entry_type.value, len(pending_count)
        )
        notify.notify_user(session, game.host_id, title, body)
    return entry


def verify_entry(
    session: Session, principal: Principal, entry_id: uuid.UUID, if_version: int | None
) -> Entry:
    entry, game = _load_entry_game(session, principal, entry_id)
    require_host(session, principal, game)
    _require_live_game(game, (GameState.running, GameState.settling))
    _check_entry_version(entry, if_version)
    if entry.state not in (EntryState.pending, EntryState.rejected):
        # verified stays verified (void to reverse); void is final
        raise AppError("entry_not_verifiable", 409, {"state": entry.state.value})
    if entry.entry_type == EntryType.cash_out:
        _cashout_slot_check(
            session, entry.game_id, entry.user_id, exclude_entry_id=entry.id
        )
    entry.state = EntryState.verified
    entry.verified_by = principal.user.id
    entry.verified_at = datetime.now(timezone.utc)
    entry.version += 1
    session.flush()
    return entry


def reject_entry(
    session: Session,
    principal: Principal,
    entry_id: uuid.UUID,
    note: str | None,
    if_version: int | None,
) -> Entry:
    entry, game = _load_entry_game(session, principal, entry_id)
    require_host(session, principal, game)
    _require_live_game(game, (GameState.running, GameState.settling))
    _check_entry_version(entry, if_version)
    if entry.state != EntryState.pending:
        # A verified entry can't be un-verified — void it instead.
        raise AppError("entry_not_pending", 409, {"state": entry.state.value})
    entry.state = EntryState.rejected
    entry.rejection_note = note
    entry.version += 1
    session.flush()
    return entry


def void_entry(
    session: Session,
    principal: Principal,
    entry_id: uuid.UUID,
    reason: str,
    if_version: int | None,
) -> Entry:
    entry, game = _load_entry_game(session, principal, entry_id)
    require_host(session, principal, game)
    if game.state in (GameState.closed, GameState.abandoned):
        raise AppError("game_closed", 409)
    _check_entry_version(entry, if_version)
    if entry.state != EntryState.verified:
        raise AppError("entry_not_verified", 409, {"state": entry.state.value})
    entry.state = EntryState.void
    entry.void_reason = reason
    entry.version += 1
    session.flush()
    return entry


def amend_entry(
    session: Session,
    principal: Principal,
    entry_id: uuid.UUID,
    amount_minor: int,
    if_version: int | None,
) -> Entry:
    entry, game = _load_entry_game(session, principal, entry_id)
    _require_live_game(game, (GameState.running, GameState.settling))
    _check_entry_version(entry, if_version)
    if entry.user_id != principal.user.id:
        raise AppError("not_entry_owner", 403)
    if entry.state != EntryState.rejected:
        raise entry_not_rejected()
    if entry.entry_type == EntryType.cash_out:
        _cashout_slot_check(session, entry.game_id, entry.user_id)

    # Never mutate the rejected row — the correction is a new record.
    amended = Entry(
        game_id=entry.game_id,
        user_id=entry.user_id,
        entry_type=entry.entry_type,
        amount_minor=amount_minor,
        state=EntryState.pending,
        logged_by=principal.user.id,
        amends_entry_id=entry.id,
    )
    session.add(amended)
    session.flush()
    return amended
