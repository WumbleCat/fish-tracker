import uuid
from datetime import datetime

from pydantic import BaseModel, Field, StrictInt


class UserOut(BaseModel):
    id: uuid.UUID
    display_name: str
    is_guest: bool
    default_currency: str
    created_at: datetime

    model_config = {"from_attributes": True}


class UserUpdate(BaseModel):
    display_name: str | None = Field(default=None, min_length=1, max_length=60)
    default_currency: str | None = Field(default=None, pattern=r"^[A-Z]{3}$")


class PayoutDetailsIn(BaseModel):
    account_name: str | None = Field(default=None, min_length=1, max_length=100)
    sort_code: str | None = Field(default=None, pattern=r"^[0-9]{6}$")
    account_number: str | None = Field(default=None, pattern=r"^[0-9]{8}$")
    payment_reference: str | None = Field(default=None, min_length=1, max_length=200)
    # A public, shareable payment link — format checked as a typo-catcher only.
    revolut_link: str | None = Field(
        default=None, pattern=r"^(https://)?revolut\.me/[A-Za-z0-9._-]{2,64}$"
    )


class PayoutDetailsMasked(BaseModel):
    """What co-players see: account number masked to its last four digits.

    The full number is only readable by the owner (API) or via the client's
    direct Supabase read under RLS, which is where reveal/copy lives.
    """

    user_id: uuid.UUID
    display_name: str
    account_name: str | None
    sort_code: str | None
    account_number_masked: str | None
    payment_reference: str | None
    # Not masked: a Revolut link is a public handle, unlike an account number.
    revolut_link: str | None


class PushTokenIn(BaseModel):
    token: str = Field(min_length=1, max_length=400)


class CurrencyHistory(BaseModel):
    currency: str
    currency_exponent: int
    games_played: int
    total_buy_ins_minor: StrictInt
    total_cash_outs_minor: StrictInt
    net_minor: StrictInt
    adjustments_minor: StrictInt


class HistoryOut(BaseModel):
    # Grouped by currency, never summed across them. There is no FX here.
    currencies: list[CurrencyHistory]


class HistoryEntryOut(BaseModel):
    id: uuid.UUID
    entry_type: str
    amount_minor: StrictInt
    state: str
    created_at: datetime


class GameHistoryOut(BaseModel):
    """One table this player sat at, with their own entries. Money counts
    verified entries only; every entry is listed regardless of state."""

    game_id: uuid.UUID
    name: str
    state: str
    created_at: datetime
    closed_at: datetime | None
    currency: str
    currency_exponent: int
    role: str
    hosted: bool
    buy_ins_minor: StrictInt
    cash_outs_minor: StrictInt
    net_minor: StrictInt
    entries: list[HistoryEntryOut]


class GamesHistoryOut(BaseModel):
    games: list[GameHistoryOut]
