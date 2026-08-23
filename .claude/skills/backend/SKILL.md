---
name: poker-ledger-backend
description: Build the FastAPI + SQLAlchemy + Postgres backend for the poker home-game ledger — schema, endpoints, permissions, verification workflow, settlement computation, and concurrency handling. Use this skill for any backend work on the poker tracker, including new endpoints, migrations, queries, auth, or business-rule changes. Trigger it even for small-sounding tasks ("add a field", "let players edit an entry", "speed up this query") — this layer is the only place the ledger's invariants are actually enforced, and a change that looks harmless in isolation can make the numbers silently wrong.
---

# Poker ledger — backend

FastAPI + SQLAlchemy + Postgres. This is the authority for the ledger: clients render what this returns and enforce nothing.

Domain rules live in `poker-ledger-game-logic`. This skill is how those rules become schema, endpoints and constraints. Where the two disagree, the game-logic skill wins and this one needs fixing.

## Non-negotiables

**Money is `INTEGER` pence.** Never `FLOAT`, never `REAL`. `NUMERIC` is acceptable but integer pence is simpler and removes a class of bug entirely. A ledger that drifts by a penny per session is worse than no ledger, because it looks authoritative.

**Amounts are always positive.** Direction comes from `entry_type`, not from the sign. Signed amounts invite a `-` in the wrong place, and `CHECK (amount_pence > 0)` catches at the database what code review won't.

**Entries are append-only.** No `UPDATE` to `amount_pence`, ever. No `DELETE`. State changes and new linked rows only. The audit trail is the product.

**The client is not trusted.** Every permission, state transition and invariant is enforced server-side. Client-side checks are UX affordances.

## Stack

| Concern | Choice |
|---|---|
| Framework | FastAPI |
| ORM | SQLAlchemy 2.0 (typed `Mapped[]` style) |
| Database | Postgres |
| Migrations | Alembic — from the first commit, not retrofitted |
| Validation | Pydantic v2 |
| Auth | JWT bearer, or Supabase Auth if hosting there |
| Driver | `psycopg[binary]` |
| Env | `uv`, Python 3.11+ |
| Tests | pytest + `httpx.AsyncClient` |

## Schema

```python
class GameState(str, Enum):
    draft = "draft"; open = "open"; running = "running"
    settling = "settling"; closed = "closed"; abandoned = "abandoned"

class EntryType(str, Enum):
    buy_in = "buy_in"; rebuy = "rebuy"; cash_out = "cash_out"

class EntryState(str, Enum):
    pending = "pending"; verified = "verified"
    rejected = "rejected"; void = "void"

class MemberRole(str, Enum):
    player = "player"; host = "host"
```

Tables:

- **`users`** — `id`, `display_name`, `created_at`. Auth identity lives here or maps to `auth.users` if using Supabase.
- **`games`** — `id`, `name`, `join_code` (unique, short, uppercase, ambiguity-free alphabet), `state`, `host_id`, `stake_pence`, `created_at`, `closed_at`, `version`.
- **`game_members`** — `game_id`, `user_id`, `role`, `joined_at`, `departed_at`, `departed_unsettled`. Unique on `(game_id, user_id)`.
- **`entries`** — `id`, `game_id`, `user_id`, `entry_type`, `amount_pence`, `state`, `created_at`, `logged_by`, `verified_by`, `verified_at`, `rejection_note`, `void_reason`, `amends_entry_id`, `version`.
- **`settlements`** — `id`, `game_id`, `computed_at`, `payments` (JSONB), `discrepancy_pence`, `acknowledged_by`. Written once at close.

Constraints that carry real weight:

```sql
ALTER TABLE entries ADD CONSTRAINT amount_positive CHECK (amount_pence > 0);
ALTER TABLE entries ADD CONSTRAINT self_verify_marked
  CHECK (verified_by IS NULL OR verified_at IS NOT NULL);
ALTER TABLE entries ADD CONSTRAINT amends_only_rejected
  CHECK (amends_entry_id IS NULL OR entry_type <> 'cash_out');

CREATE UNIQUE INDEX one_active_cashout
  ON entries (game_id, user_id)
  WHERE entry_type = 'cash_out' AND state IN ('pending', 'verified');
```

That partial unique index is the one to get right — it's what stops a player having two live cash-outs, which would otherwise silently double their settleable position.

`logged_by` and `user_id` are separate columns because the host may log on someone's behalf ("just put me down for another twenty" shouted across the room). The entry belongs to the player; the action belongs to whoever performed it.

## Endpoints

```
POST   /api/games                       create (creator becomes host)
GET    /api/games/{id}                  full state: members, entries, totals
POST   /api/games/join                  body: {join_code}
POST   /api/games/{id}/state            body: {to: GameState}
POST   /api/games/{id}/transfer-host    body: {user_id}

POST   /api/games/{id}/entries          log buy-in / rebuy / cash-out
POST   /api/entries/{id}/verify
POST   /api/entries/{id}/reject         body: {note?}
POST   /api/entries/{id}/void           body: {reason}
POST   /api/entries/{id}/amend          body: {amount_pence}

GET    /api/games/{id}/settlement       computed, verified entries only
POST   /api/games/{id}/close            body: {acknowledge_discrepancy?}

GET    /api/users/me/history            lifetime stats across games
```

State changes are `POST` to a named action rather than `PATCH` on a field. A rejection isn't an edit — it's an event with an actor, a time and a reason, and modelling it as a field update loses all three.

## The two totals

`GET /api/games/{id}` returns both, because they answer different questions:

```python
chips_on_table = sum(buy_ins where state in (pending, verified)) \
               - sum(cash_outs where state in (pending, verified))

settleable = sum(verified buy_ins) - sum(verified cash_outs)  # per player
```

`chips_on_table` includes pending because the chips are physically in front of the player regardless of whether the host has tapped a button — it's the figure to reconcile against a physical count. `settleable` drives who pays whom. Return `pending_pence` as their difference so clients can say "£40 awaiting verification" without recomputing.

## Settlement

Compute server-side. Never let a client derive payments — two implementations diverge eventually, and the one users see shouldn't be the second-best copy.

```python
def settle(nets: dict[UUID, int]) -> list[Payment]:
    owed = sorted(((u, n) for u, n in nets.items() if n > 0),
                  key=lambda x: -x[1])
    owes = sorted(((u, -n) for u, n in nets.items() if n < 0),
                  key=lambda x: -x[1])
    payments, i, j = [], 0, 0
    while i < len(owes) and j < len(owed):
        (du, da), (cu, ca) = owes[i], owed[j]
        amount = min(da, ca)
        payments.append(Payment(from_user=du, to_user=cu, pence=amount))
        owes[i], owed[j] = (du, da - amount), (cu, ca - amount)
        if owes[i][1] == 0: i += 1
        if owed[j][1] == 0: j += 1
    return payments
```

Greedy largest-against-largest doesn't guarantee the minimum number of transfers (NP-hard) but runs instantly and typically gives three or four payments for eight players.

Assert `sum(nets.values()) == 0` before settling. A non-zero sum is a derivation bug, not a rounding artefact — raise rather than paper over it.

On close, persist the result to `settlements`. The settlement a player saw when they handed over cash must remain retrievable even if an adjustment is recorded later.

## Enforcement points

Do these in the service layer, inside a transaction, with the game row locked (`SELECT ... FOR UPDATE`):

**Close** — reject if any entry in the game is `pending`. This is the most important gate in the system; a game closing with unresolved claims produces a settlement built on incomplete data.

**Reconciliation** — on close, if verified buy-ins ≠ verified cash-outs, require `acknowledge_discrepancy` and record the amount plus the acknowledging user. Never round it away silently.

**State transitions** — validate against the allowed map. `settling → running` is permitted ("one more orbit" always happens); `closed → anything` never is. Corrections after close become a new adjustment record referencing the closed game.

**Verify / reject / void** — host only. Void requires a reason and applies to verified entries only. A verified entry can't be un-verified, only voided; reversal is an explicit recorded act, not an undo.

**Amend** — the entry's owner only, on rejected entries only. Creates a new `pending` entry with `amends_entry_id` set. Never mutate the rejected row's amount.

**No auto-verification.** Not below a threshold, not after a timeout, not for the host's own entries. An auto-verified row is indistinguishable in the data from a checked one, which devalues every verified row.

Host self-verification is allowed (requiring a second person deadlocks when the host is the only one paying attention) but `verified_by == user_id` should be queryable so a discrepancy can be traced.

## Concurrency

Two players logging at once is routine and conflict-free — entries are append-only inserts.

Verification races are real: a host verifies while the player amends the same entry. Every entry carries a `version` column; mutating endpoints take `if_version` and return `409` with the current row when it doesn't match. The client refetches and retries.

Close and state transitions take a row lock on `games` for the duration of the transaction, so two hosts can't close concurrently and produce two settlements.

## Errors

Return structured problems, not bare strings, since clients branch on them:

```json
{"error": "pending_entries_block_close", "detail": {"count": 3}}
```

Codes worth having: `pending_entries_block_close`, `reconciliation_mismatch`, `version_conflict`, `not_host`, `invalid_state_transition`, `entry_not_rejected`, `game_closed`.

`reconciliation_mismatch` is a normal, expected condition rather than a failure — it means chips need recounting. Don't dress it as a server error.

## Testing

pytest against a real Postgres (testcontainers or a scratch database), not SQLite — the partial unique index and `CHECK` constraints don't exist under SQLite, and those are exactly what's being tested.

Cover at minimum:

- A game with pending entries refuses to close.
- Rejected entries are excluded from settlement; pending entries are excluded from settlement but included in chips-on-table.
- Amend creates a new row and leaves the rejected row untouched.
- Nets sum to zero across a full game; settlement payments reconcile.
- Version conflict on concurrent verify + amend returns `409`.
- A non-host calling verify gets `403`.
- Money round-trips exactly across large values and many entries.

## Working conventions

Build in this order: migration, SQLAlchemy model, Pydantic schema, service function with its test, then the route. The service function is where invariants live; written after the route it tends to get shaped by what's convenient to expose.

Keep all rule enforcement in `services/`. Routes parse, authorise and delegate — they contain no business logic. Settlement lives in `services/settlement.py` and is pure: entries in, payments out, no database access.

Flag rather than guess. If a task implies a rule the game-logic skill doesn't cover — whether cash-outs need verification, how tournaments differ — raise it instead of inventing an answer that then hardens into schema.
