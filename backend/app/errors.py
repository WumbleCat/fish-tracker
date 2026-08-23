"""Structured error codes. Clients branch on `error`, so codes are contract."""

from typing import Any


class AppError(Exception):
    def __init__(self, code: str, status: int, detail: dict[str, Any] | None = None):
        self.code = code
        self.status = status
        self.detail = detail or {}
        super().__init__(code)


def not_found(what: str) -> AppError:
    return AppError(f"{what}_not_found", 404)


def not_host() -> AppError:
    return AppError("not_host", 403)


def guest_not_permitted() -> AppError:
    return AppError("guest_not_permitted", 403)


def not_member() -> AppError:
    # Deliberately the same shape as game_not_found so a non-member can't
    # probe which game ids exist.
    return AppError("game_not_found", 404)


def invalid_state_transition(from_state: str, to_state: str) -> AppError:
    return AppError(
        "invalid_state_transition", 409, {"from": from_state, "to": to_state}
    )


def version_conflict(current: dict[str, Any]) -> AppError:
    """409 carrying the current row so the client can refetch-free retry."""
    return AppError("version_conflict", 409, {"current": current})


def pending_entries_block_close(count: int) -> AppError:
    return AppError("pending_entries_block_close", 409, {"count": count})


def reconciliation_mismatch(discrepancy_minor: int) -> AppError:
    # Normal, expected condition — chips need recounting, not a server fault.
    return AppError(
        "reconciliation_mismatch", 409, {"discrepancy_minor": discrepancy_minor}
    )


def cashout_already_live() -> AppError:
    return AppError("cashout_already_live", 409)


def entry_not_rejected() -> AppError:
    return AppError("entry_not_rejected", 409)


def currency_locked() -> AppError:
    return AppError("currency_locked", 409)


def game_closed() -> AppError:
    return AppError("game_closed", 409)
