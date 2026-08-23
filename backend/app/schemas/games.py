import uuid
from datetime import datetime

from pydantic import BaseModel, Field, StrictInt

from app.models.enums import GameState, MemberRole
from app.schemas.entries import EntryOut


class GameCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    currency: str = Field(default="GBP", pattern=r"^[A-Z]{3}$")
    # Omitted -> derived from ISO 4217 metadata for the currency.
    currency_exponent: int | None = Field(default=None, ge=0, le=4)
    stake_minor: StrictInt | None = Field(default=None, gt=0)


class JoinRequest(BaseModel):
    join_code: str = Field(min_length=6, max_length=6)


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
    created_at: datetime
    closed_at: datetime | None
    version: int
    members: list[MemberOut]
    entries: list[EntryOut]
    nets: list[PlayerNet]
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
