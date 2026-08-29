import uuid
from datetime import datetime

from pydantic import BaseModel, Field, StrictInt, model_validator

from app.models.enums import GameEventType, GameState, MemberRole
from app.schemas.entries import EntryOut


def _check_blinds(small: int | None, big: int | None) -> None:
    """Set together, big at least small. Mirrors the CHECK constraints in
    20260826090000 so a bad pair is refused before it reaches the database."""
    if (small is None) != (big is None):
        raise ValueError("small_blind_minor and big_blind_minor are set together")
    if small is not None and big is not None and big < small:
        raise ValueError("big_blind_minor must be at least small_blind_minor")


class GameCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    currency: str = Field(default="GBP", pattern=r"^[A-Z]{3}$")
    # Omitted -> derived from ISO 4217 metadata for the currency.
    currency_exponent: int | None = Field(default=None, ge=0, le=4)
    stake_minor: StrictInt | None = Field(default=None, gt=0)
    # The table's stakes. Set together or not at all; big >= small. These are
    # not ledger money and never reach a net or a settlement.
    small_blind_minor: StrictInt | None = Field(default=None, gt=0)
    big_blind_minor: StrictInt | None = Field(default=None, gt=0)

    @model_validator(mode="after")
    def _blinds_coherent(self):
        _check_blinds(self.small_blind_minor, self.big_blind_minor)
        return self


class BlindsChangeRequest(BaseModel):
    """Both values, every time — a big blind with no small blind is not a
    state worth being able to express."""

    small_blind_minor: StrictInt = Field(gt=0)
    big_blind_minor: StrictInt = Field(gt=0)
    if_version: int | None = None

    @model_validator(mode="after")
    def _blinds_coherent(self):
        _check_blinds(self.small_blind_minor, self.big_blind_minor)
        return self


class GameEventOut(BaseModel):
    id: uuid.UUID
    game_id: uuid.UUID
    event_type: GameEventType
    actor_user_id: uuid.UUID
    created_at: datetime
    from_small_blind_minor: StrictInt | None
    from_big_blind_minor: StrictInt | None
    to_small_blind_minor: StrictInt | None
    to_big_blind_minor: StrictInt | None

    model_config = {"from_attributes": True}


class JoinRequest(BaseModel):
    join_code: str = Field(min_length=6, max_length=6)


class AddPlayerRequest(BaseModel):
    """A name is the whole payload. The host is seating someone who is not
    using the app; there is nothing else to know about them."""

    display_name: str = Field(min_length=1, max_length=60)


class StateChangeRequest(BaseModel):
    to: GameState
    if_version: int | None = None


class TransferHostRequest(BaseModel):
    user_id: uuid.UUID
    if_version: int | None = None


class CurrencyChangeRequest(BaseModel):
    currency: str = Field(pattern=r"^[A-Z]{3}$")
    currency_exponent: int | None = Field(default=None, ge=0, le=4)
    if_version: int | None = None


class RemoveMemberRequest(BaseModel):
    if_version: int | None = None


class MemberOut(BaseModel):
    user_id: uuid.UUID
    display_name: str
    is_guest: bool
    role: MemberRole
    joined_at: datetime
    departed_at: datetime | None
    departed_unsettled: bool
    # Whether this member could be handed the game. The rule lives on the
    # server so two clients cannot drift on who is eligible.
    can_host: bool


class PlayerNet(BaseModel):
    """settleable is the live net (verified only). pending_delta is returned
    separately and must never be folded into it — on any client."""

    user_id: uuid.UUID
    settleable_minor: StrictInt
    pending_delta_minor: StrictInt
    pending_count: int


class GameTotals(BaseModel):
    verified_buy_ins_minor: StrictInt
    verified_cash_outs_minor: StrictInt
    # Includes pending: the chips are on the table whether or not the host
    # has tapped verify. This is the figure to reconcile against a count.
    chips_on_table_minor: StrictInt
    pending_count: int


class GameOut(BaseModel):
    id: uuid.UUID
    name: str
    join_code: str
    state: GameState
    host_id: uuid.UUID
    currency: str
    currency_exponent: int
    stake_minor: StrictInt | None
    small_blind_minor: StrictInt | None
    big_blind_minor: StrictInt | None
    created_at: datetime
    closed_at: datetime | None
    version: int
    members: list[MemberOut]
    entries: list[EntryOut]
    nets: list[PlayerNet]
    # Rendered inline in the log; never counted into any figure above.
    events: list[GameEventOut]
    totals: GameTotals


class GameSummary(BaseModel):
    id: uuid.UUID
    name: str
    state: GameState
    currency: str
    currency_exponent: int
    created_at: datetime
    closed_at: datetime | None
    role: MemberRole

    model_config = {"from_attributes": True}
