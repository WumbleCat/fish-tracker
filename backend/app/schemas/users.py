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
