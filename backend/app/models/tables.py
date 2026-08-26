"""SQLAlchemy models, hand-kept in step with supabase/migrations/*.sql.

The schema-drift test (tests/test_schema_drift.py) reflects the live database
and asserts these agree with it — edit the SQL and this file together.
"""

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import (
    BigInteger,
    Boolean,
    CHAR,
    DateTime,
    ForeignKey,
    Integer,
    SmallInteger,
    Text,
    text,
)
from sqlalchemy.dialects.postgresql import ENUM as PgEnum
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base
from app.models.enums import (
    EntryState,
    EntryType,
    GameEventType,
    GameState,
    MemberRole,
)


def _pg_enum(py_enum, name: str) -> PgEnum:
    # The types already exist in Postgres (created by migration); never let
    # SQLAlchemy try to create or drop them.
    return PgEnum(
        py_enum,
        name=name,
        create_type=False,
        values_callable=lambda e: [m.value for m in e],
    )


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    auth_user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    display_name: Mapped[str] = mapped_column(Text)
    is_guest: Mapped[bool] = mapped_column(Boolean, server_default=text("false"))
    default_currency: Mapped[str] = mapped_column(CHAR(3), server_default=text("'GBP'"))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()")
    )


class PayoutDetails(Base):
    __tablename__ = "payout_details"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), primary_key=True
    )
    account_name: Mapped[str | None] = mapped_column(Text)
    sort_code: Mapped[str | None] = mapped_column(Text)
    account_number: Mapped[str | None] = mapped_column(Text)
    payment_reference: Mapped[str | None] = mapped_column(Text)
    revolut_link: Mapped[str | None] = mapped_column(Text)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()")
    )


class Game(Base):
    __tablename__ = "games"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    name: Mapped[str] = mapped_column(Text)
    join_code: Mapped[str] = mapped_column(Text, unique=True)
    state: Mapped[GameState] = mapped_column(
        _pg_enum(GameState, "game_state"), server_default=text("'draft'")
    )
    host_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    currency: Mapped[str] = mapped_column(CHAR(3), server_default=text("'GBP'"))
    currency_exponent: Mapped[int] = mapped_column(SmallInteger, server_default=text("2"))
    stake_minor: Mapped[int | None] = mapped_column(BigInteger)
    # The table's stakes. Not ledger money: never summed into a net,
    # total, reconciliation or settlement (app-logic, 2026-08-26).
    small_blind_minor: Mapped[int | None] = mapped_column(BigInteger)
    big_blind_minor: Mapped[int | None] = mapped_column(BigInteger)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()")
    )
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    version: Mapped[int] = mapped_column(Integer, server_default=text("1"))


class GameMember(Base):
    __tablename__ = "game_members"

    game_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("games.id"), primary_key=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), primary_key=True
    )
    role: Mapped[MemberRole] = mapped_column(
        _pg_enum(MemberRole, "member_role"), server_default=text("'player'")
    )
    joined_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()")
    )
    departed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    departed_unsettled: Mapped[bool] = mapped_column(Boolean, server_default=text("false"))


class Entry(Base):
    __tablename__ = "entries"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    game_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("games.id"))
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    entry_type: Mapped[EntryType] = mapped_column(_pg_enum(EntryType, "entry_type"))
    amount_minor: Mapped[int] = mapped_column(BigInteger)
    state: Mapped[EntryState] = mapped_column(
        _pg_enum(EntryState, "entry_state"), server_default=text("'pending'")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()")
    )
    logged_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    verified_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id")
    )
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    rejection_note: Mapped[str | None] = mapped_column(Text)
    void_reason: Mapped[str | None] = mapped_column(Text)
    amends_entry_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("entries.id")
    )
    version: Mapped[int] = mapped_column(Integer, server_default=text("1"))
    # Idempotency key from the mobile offline queue; unique per (game, user).
    client_key: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))


class PushToken(Base):
    __tablename__ = "push_tokens"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), primary_key=True
    )
    token: Mapped[str] = mapped_column(Text, primary_key=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()")
    )


class Settlement(Base):
    __tablename__ = "settlements"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    game_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("games.id"), unique=True
    )
    computed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()")
    )
    payments: Mapped[list[dict[str, Any]]] = mapped_column(JSONB)
    discrepancy_minor: Mapped[int] = mapped_column(BigInteger, server_default=text("0"))
    acknowledged_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id")
    )


class Adjustment(Base):
    __tablename__ = "adjustments"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    game_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("games.id"))
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    direction: Mapped[str] = mapped_column(Text)
    amount_minor: Mapped[int] = mapped_column(BigInteger)
    note: Mapped[str] = mapped_column(Text)
    created_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()")
    )


class GameEvent(Base):
    """Append-only, never counted. Sits beside the entries in the log and
    contributes nothing to any figure (app-logic, 2026-08-26)."""

    __tablename__ = "game_events"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    game_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("games.id"))
    event_type: Mapped[GameEventType] = mapped_column(
        _pg_enum(GameEventType, "game_event_type")
    )
    actor_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()")
    )
    from_small_blind_minor: Mapped[int | None] = mapped_column(BigInteger)
    from_big_blind_minor: Mapped[int | None] = mapped_column(BigInteger)
    to_small_blind_minor: Mapped[int | None] = mapped_column(BigInteger)
    to_big_blind_minor: Mapped[int | None] = mapped_column(BigInteger)
