import uuid
from datetime import datetime

from pydantic import BaseModel, Field, StrictInt

from app.models.enums import EntryState, EntryType


class EntryCreate(BaseModel):
    entry_type: EntryType
    amount_minor: StrictInt = Field(gt=0)
    # Host may log on a player's behalf; omitted means "for myself".
    user_id: uuid.UUID | None = None


class EntryActionRequest(BaseModel):
    if_version: int | None = None


class RejectRequest(BaseModel):
    note: str | None = Field(default=None, max_length=500)
    if_version: int | None = None


class VoidRequest(BaseModel):
    reason: str = Field(min_length=1, max_length=500)
    if_version: int | None = None


class AmendRequest(BaseModel):
    amount_minor: StrictInt = Field(gt=0)
    if_version: int | None = None


class EntryOut(BaseModel):
    id: uuid.UUID
    game_id: uuid.UUID
    user_id: uuid.UUID
    entry_type: EntryType
    amount_minor: StrictInt
    state: EntryState
    created_at: datetime
    logged_by: uuid.UUID
    verified_by: uuid.UUID | None
    verified_at: datetime | None
    rejection_note: str | None
    void_reason: str | None
    amends_entry_id: uuid.UUID | None
    version: int

    model_config = {"from_attributes": True}
