import uuid
from datetime import datetime

from pydantic import BaseModel, StrictInt


class PaymentOut(BaseModel):
    from_user: uuid.UUID
    to_user: uuid.UUID
    amount_minor: StrictInt


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
