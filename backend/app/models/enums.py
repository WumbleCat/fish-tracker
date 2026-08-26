from enum import Enum


class GameState(str, Enum):
    draft = "draft"
    open = "open"
    running = "running"
    settling = "settling"
    closed = "closed"
    abandoned = "abandoned"


class EntryType(str, Enum):
    buy_in = "buy_in"
    rebuy = "rebuy"
    cash_out = "cash_out"


class EntryState(str, Enum):
    pending = "pending"
    verified = "verified"
    rejected = "rejected"
    void = "void"


class MemberRole(str, Enum):
    player = "player"
    host = "host"


class GameEventType(str, Enum):
    """Non-money occurrences worth recording. An event never carries an
    amount and is never summed (app-logic, 2026-08-26)."""

    blinds_changed = "blinds_changed"
