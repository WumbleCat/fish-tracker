from fastapi import APIRouter

from app.deps import CurrentPrincipal, DbSession
from app.schemas.users import (
    HistoryOut,
    PayoutDetailsIn,
    UserOut,
    UserUpdate,
)
from app.services import users as users_service

router = APIRouter(prefix="/api/users", tags=["users"])


@router.get("/me", response_model=UserOut)
def me(principal: CurrentPrincipal):
    return principal.user


@router.patch("/me", response_model=UserOut)
def update_me(body: UserUpdate, session: DbSession, principal: CurrentPrincipal):
    return users_service.update_me(
        session, principal, body.display_name, body.default_currency
    )


@router.put("/me/payout-details", response_model=PayoutDetailsIn)
def put_payout_details(
    body: PayoutDetailsIn, session: DbSession, principal: CurrentPrincipal
):
    row = users_service.upsert_payout_details(
        session,
        principal,
        body.account_name,
        body.sort_code,
        body.account_number,
        body.payment_reference,
    )
    return PayoutDetailsIn(
        account_name=row.account_name,
        sort_code=row.sort_code,
        account_number=row.account_number,
        payment_reference=row.payment_reference,
    )


@router.get("/me/history", response_model=HistoryOut)
def history(session: DbSession, principal: CurrentPrincipal):
    return HistoryOut(currencies=users_service.lifetime_history(session, principal))
