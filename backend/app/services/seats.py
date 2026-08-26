"""A table seats at most eleven, host included (app-logic, 2026-08-26,
superseding the nine of 2026-08-24). Shared
by the registered and guest join paths; the database trigger in
20260826090000_blinds_and_eleven_seats.sql is the backstop behind this
check."""

import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.errors import table_full
from app.models import GameMember

MAX_SEATS = 11


def seated_count(session: Session, game_id: uuid.UUID) -> int:
    """People currently at the table: members who have not departed."""
    return session.execute(
        select(func.count())
        .select_from(GameMember)
        .where(GameMember.game_id == game_id, GameMember.departed_at.is_(None))
    ).scalar_one()


def require_seat(session: Session, game_id: uuid.UUID) -> None:
    if seated_count(session, game_id) >= MAX_SEATS:
        raise table_full(MAX_SEATS)
