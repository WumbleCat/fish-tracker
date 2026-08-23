from typing import Annotated

from fastapi import Depends, Header
from sqlalchemy.orm import Session

from app.db import get_session
from app.errors import AppError
from app.services.auth import Principal, resolve_principal

DbSession = Annotated[Session, Depends(get_session)]


def get_principal(
    session: DbSession,
    authorization: Annotated[str | None, Header()] = None,
) -> Principal:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise AppError("missing_token", 401)
    return resolve_principal(session, authorization.split(" ", 1)[1].strip())


CurrentPrincipal = Annotated[Principal, Depends(get_principal)]
