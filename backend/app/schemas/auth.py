import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class GuestJoinRequest(BaseModel):
    join_code: str = Field(min_length=6, max_length=6)
    display_name: str = Field(min_length=1, max_length=60)


class GuestTokenResponse(BaseModel):
    token: str
    user_id: uuid.UUID
    game_id: uuid.UUID
    expires_at: datetime


class ClaimRequest(BaseModel):
    # The registered session arrives in the Authorization header; the guest
    # identity being claimed arrives here.
    guest_token: str
