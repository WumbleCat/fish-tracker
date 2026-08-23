import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import (
    Adjustment,
    Entry,
    EntryState,
    EntryType,
    Game,
    GameMember,
    GameState,
    PayoutDetails,
    PushToken,
    User,
)
from app.services.auth import Principal
from app.services.games import load_member_game


def update_me(
    session: Session,
    principal: Principal,
    display_name: str | None,
    default_currency: str | None,
) -> User:
    if display_name is not None:
        principal.user.display_name = display_name
    if default_currency is not None:
        principal.require_registered()
        principal.user.default_currency = default_currency
    session.flush()
    return principal.user


def upsert_payout_details(
    session: Session,
    principal: Principal,
    account_name: str | None,
    sort_code: str | None,
    account_number: str | None,
    payment_reference: str | None,
) -> PayoutDetails:
    principal.require_registered()
    row = session.get(PayoutDetails, principal.user.id)
    if row is None:
        row = PayoutDetails(user_id=principal.user.id)
        session.add(row)
    row.account_name = account_name
    row.sort_code = sort_code
    row.account_number = account_number
    row.payment_reference = payment_reference
    row.updated_at = datetime.now(timezone.utc)
    session.flush()
    return row


def mask_account_number(account_number: str | None) -> str | None:
    if not account_number:
        return None
    return "••••" + account_number[-4:]


def game_payout_details(
    session: Session, principal: Principal, game_id: uuid.UUID
) -> list[dict]:
    """Masked details for this game's registered members. Guests are rejected
    outright per the backend auth contract; reveal/copy happens client-side
    via the direct Supabase read that RLS scopes the same way."""
    principal.require_registered()
    load_member_game(session, principal, game_id)
    rows = session.execute(
        select(PayoutDetails, User)
        .join(User, User.id == PayoutDetails.user_id)
        .join(GameMember, GameMember.user_id == PayoutDetails.user_id)
        .where(GameMember.game_id == game_id)
    ).all()
    return [
        {
            "user_id": pd.user_id,
            "display_name": u.display_name,
            "account_name": pd.account_name,
            "sort_code": pd.sort_code,
            "account_number_masked": mask_account_number(pd.account_number),
            "payment_reference": pd.payment_reference,
        }
        for pd, u in rows
    ]


def register_push_token(session: Session, principal: Principal, token: str) -> None:
    """One row per (user, device token); re-registering refreshes it. Guests
    can register too — a guest host can't exist, but a guest's own rejected
    entry still warrants a nudge in future; for now tokens just sit unused
    for non-hosts."""
    row = session.get(PushToken, (principal.user.id, token))
    if row is None:
        session.add(PushToken(user_id=principal.user.id, token=token))
    else:
        row.updated_at = datetime.now(timezone.utc)
    session.flush()


def lifetime_history(session: Session, principal: Principal) -> list[dict]:
    """Totals grouped by currency, never summed across them."""
    principal.require_registered()
    uid = principal.user.id

    games = {
        g.id: g
        for g in session.execute(
            select(Game)
            .join(GameMember, GameMember.game_id == Game.id)
            .where(GameMember.user_id == uid, Game.state == GameState.closed)
        ).scalars()
    }
    entries = session.execute(
        select(Entry).where(
            Entry.user_id == uid,
            Entry.state == EntryState.verified,
            Entry.game_id.in_(games.keys()) if games else False,
        )
    ).scalars()

    by_currency: dict[str, dict] = {}

    def bucket(currency: str, exponent: int) -> dict:
        return by_currency.setdefault(
            currency,
            {
                "currency": currency,
                "currency_exponent": exponent,
                "game_ids": set(),
                "total_buy_ins_minor": 0,
                "total_cash_outs_minor": 0,
                "adjustments_minor": 0,
            },
        )

    if games:
        for e in entries:
            g = games[e.game_id]
            b = bucket(g.currency, g.currency_exponent)
            b["game_ids"].add(g.id)
            if e.entry_type == EntryType.cash_out:
                b["total_cash_outs_minor"] += e.amount_minor
            else:
                b["total_buy_ins_minor"] += e.amount_minor

        # Adjustments appear in lifetime history as their own line beside the
        # original settlement (decided 2026-08-23).
        for adj in session.execute(
            select(Adjustment).where(
                Adjustment.user_id == uid, Adjustment.game_id.in_(games.keys())
            )
        ).scalars():
            g = games[adj.game_id]
            b = bucket(g.currency, g.currency_exponent)
            b["adjustments_minor"] += (
                adj.amount_minor if adj.direction == "credit" else -adj.amount_minor
            )

    return [
        {
            "currency": b["currency"],
            "currency_exponent": b["currency_exponent"],
            "games_played": len(b["game_ids"]),
            "total_buy_ins_minor": b["total_buy_ins_minor"],
            "total_cash_outs_minor": b["total_cash_outs_minor"],
            "net_minor": b["total_cash_outs_minor"] - b["total_buy_ins_minor"],
            "adjustments_minor": b["adjustments_minor"],
        }
        for b in by_currency.values()
    ]
