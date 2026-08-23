"""Push notifications to the host via Expo's push API. Fire-and-forget: a
failed push must never fail the entry that triggered it, and nothing about
an entry's amount goes into a lock-screen notification beyond what the
table can already see."""

import json
import logging
import threading
import urllib.request
import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import PushToken

logger = logging.getLogger(__name__)

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"


def _post(messages: list[dict]) -> None:
    try:
        req = urllib.request.Request(
            EXPO_PUSH_URL,
            data=json.dumps(messages).encode(),
            headers={"Content-Type": "application/json"},
        )
        urllib.request.urlopen(req, timeout=10)
    except Exception:
        logger.warning("push notification delivery failed", exc_info=True)


def notify_user(session: Session, user_id: uuid.UUID, title: str, body: str) -> None:
    tokens = (
        session.execute(select(PushToken.token).where(PushToken.user_id == user_id))
        .scalars()
        .all()
    )
    if not tokens:
        return
    messages = [{"to": t, "title": title, "body": body, "sound": "default"} for t in tokens]
    threading.Thread(target=_post, args=(messages,), daemon=True).start()


def build_pending_entry_notification(
    display_name: str, entry_type: str, count_pending: int
) -> tuple[str, str]:
    """Who and what — never the amount, and never anything from payout land."""
    kind = entry_type.replace("_", "-")
    title = f"{display_name} logged a {kind}"
    body = f"{count_pending} entr{'y' if count_pending == 1 else 'ies'} awaiting your verification"
    return title, body
