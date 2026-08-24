import uuid
from datetime import datetime

from pydantic import BaseModel, StrictInt


class PaymentOut(BaseModel):
    from_user: uuid.UUID
    to_user: uuid.UUID
    amount_minor: StrictInt
    # The host's record that this payment was paid — looked up live from
    # payment_marks, never stored in the settlement snapshot.
    paid: bool = False
    paid_at: datetime | None = None


class SettlementOut(BaseModel):
    """final=True renders the persisted close-time snapshot; final=False is a
    live preview from verified entries. Payments reference user ids only —
    payout details are looked up live, never persisted here."""

    final: bool
    computed_at: datetime | None
    payments: list[PaymentOut]
    discrepancy_minor: StrictInt
    acknowledged_by: uuid.UUID | None
    needs_acknowledgement: bool
    pending_count: int
    nets: dict[uuid.UUID, StrictInt]


class CloseRequest(BaseModel):
    acknowledge_discrepancy: bool = False
    if_version: int | None = None


class PaymentMarkRequest(BaseModel):
    from_user: uuid.UUID
    to_user: uuid.UUID
    paid: bool
