import uuid

from fastapi import APIRouter

from app.deps import CurrentPrincipal, DbSession
from app.schemas.entries import (
    AmendRequest,
    EntryActionRequest,
    EntryOut,
    RejectRequest,
    VoidRequest,
)
from app.services import entries as entries_service

router = APIRouter(prefix="/api/entries", tags=["entries"])


@router.post("/{entry_id}/verify", response_model=EntryOut)
def verify(
    entry_id: uuid.UUID,
    body: EntryActionRequest,
    session: DbSession,
    principal: CurrentPrincipal,
):
    return entries_service.verify_entry(session, principal, entry_id, body.if_version)


@router.post("/{entry_id}/reject", response_model=EntryOut)
def reject(
    entry_id: uuid.UUID,
    body: RejectRequest,
    session: DbSession,
    principal: CurrentPrincipal,
):
    return entries_service.reject_entry(
        session, principal, entry_id, body.note, body.if_version
    )


@router.post("/{entry_id}/void", response_model=EntryOut)
def void(
    entry_id: uuid.UUID,
    body: VoidRequest,
    session: DbSession,
    principal: CurrentPrincipal,
):
    return entries_service.void_entry(
        session, principal, entry_id, body.reason, body.if_version
    )


@router.post("/{entry_id}/amend", response_model=EntryOut, status_code=201)
def amend(
    entry_id: uuid.UUID,
    body: AmendRequest,
    session: DbSession,
    principal: CurrentPrincipal,
):
    return entries_service.amend_entry(
        session, principal, entry_id, body.amount_minor, body.if_version, body.client_key
    )
