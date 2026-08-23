---
name: backend
description: Build the fish-tracker backend — FastAPI + SQLAlchemy on Supabase (Postgres, Auth, Realtime, RLS). Covers schema and SQL migrations, auth for registered users and guests, endpoints, permissions, the verification workflow for buy-ins and cash-outs, multi-currency amounts, payout details, settlement computation and concurrency handling. Use this skill for any backend work on fish-tracker, including new endpoints, migrations, queries, auth, RLS policies, or business-rule changes. Trigger it even for small-sounding tasks ("add a field", "let players edit an entry", "speed up this query") — this layer is the only place the ledger's invariants are actually enforced, and a change that looks harmless in isolation can make the numbers silently wrong.
---

# fish-tracker — backend

FastAPI + SQLAlchemy over **Supabase**. This is the authority for the ledger: clients render what it returns and enforce nothing.

Domain rules live in `app-logic`. This skill is how those rules become schema, policies and endpoints. Where the two disagree, `app-logic` wins and this one needs fixing. Repo layout, git flow and environments are in `repo`.

## Non-negotiables

**Supabase is the platform, always.** Postgres, Auth, Realtime and RLS all come from the Supabase project. Do not introduce a second database, a second auth system, or a parallel user table with its own passwords. If something seems to need one, raise it.

**Money is an `INTEGER` count of minor units.** Never `FLOAT`, never `REAL`. `NUMERIC` is acceptable but integer minor units is simpler and removes a class of bug entirely. A ledger that drifts by a penny per session is worse than no ledger, because it looks authoritative.

**Amounts are always positive.** Direction comes from `entry_type`, not from the sign. Signed amounts invite a `-` in the wrong place, and `CHECK (amount_minor > 0)` catches at the database what code review won't.

**Entries are append-only.** No `UPDATE` to `amount_minor`, ever. No `DELETE`. State changes and new linked rows only. The audit trail is the product.

**The client is not trusted.** Every permission, state transition and invariant is enforced server-side, in the service layer, and again in RLS. Client-side checks are UX affordances.

## Stack

| Concern | Choice |
|---|---|
| Framework | FastAPI |
| ORM | SQLAlchemy 2.0 (typed `Mapped[]` style) |
| Database | Supabase Postgres |
| Migrations | SQL files in `supabase/migrations/`, applied with the Supabase CLI |
| Validation | Pydantic v2 |
| Auth | Supabase Auth (registered users) + backend-minted guest JWTs |
| Realtime | Supabase Realtime on `entries` and `game_members`, governed by RLS |
| Driver | `psycopg[binary]` via the Supabase session pooler |
| Env | `uv`, Python 3.11+ |
| Tests | pytest + `httpx.AsyncClient` against a Supabase branch or local `supabase start` |
| Hosting | **Local only for now** — `uvicorn` on the host machine. See "Running it" |

### Why SQL migrations and not Alembic

Earlier drafts of this skill specified Alembic. That is superseded. The schema carries RLS policies, partial unique indexes and triggers; Alembic autogenerate does not model policies and will happily drop what it can't see. SQL migration files in `supabase/migrations/` are the single source of truth, they are what the Supabase CLI and branching already speak, and they review as the thing that actually runs.

SQLAlchemy models are hand-maintained to match. Keep them honest with a test that reflects the live schema and asserts every mapped column, type and nullability agrees — schema drift between models and database is the failure this trade buys, so test it rather than hoping.

## Running it

The backend runs on the developer machine and talks to the hosted Supabase project. There is no deployed API yet; deployment target is an open decision, so do not add Dockerfiles, Vercel config or CI deploy steps until it is made.

```
uv run uvicorn app.main:app --reload --port 8000
```

Environment (never committed — see `repo` for the `.env` contract):

| Var | Use |
|---|---|
| `SUPABASE_URL` | Project URL |
| `SUPABASE_ANON_KEY` | Handed to clients, not used by the backend |
| `SUPABASE_SERVICE_ROLE_KEY` | Backend only. Bypasses RLS — never send it to a client |
| `SUPABASE_JWT_SECRET` | Verifying Supabase Auth tokens and signing guest tokens |
| `DATABASE_URL` | Session-pooler connection string |

The service role key bypasses RLS entirely. That is why the service layer must do its own permission checks: RLS is the second line, protecting direct client reads and Realtime, not the first.

## Auth

Two token types reach the API, and both resolve to a row in `users`.

**Registered users** authenticate with Supabase Auth (email + password and magic link). The client sends the Supabase access token; the backend verifies it against the project JWT secret and maps `sub` → `users.auth_user_id`. Sign-up creates the `auth.users` row via Supabase; a trigger (or the first authenticated call) creates the matching `public.users` row. Never store passwords.

**Guests** get a token the backend mints when they join with a code and a display name. Sign it with `SUPABASE_JWT_SECRET` so Supabase Realtime and RLS accept it too, and include:

```json
{"sub": "<users.id>", "role": "authenticated", "fish_guest": true, "game_id": "<uuid>"}
```

A guest token is valid for that one `game_id` and nothing else. Every endpoint must reject a guest token whose `game_id` doesn't match the resource, and must reject guests outright on host actions, payout details and lifetime history. Guest tokens expire; refresh is allowed while the game is not `closed`.

**Claiming.** A guest who later signs up can claim their record: the claim endpoint takes the guest token plus a fresh registered session, and repoints `users.auth_user_id` at the new identity, setting `is_guest = false`. It never moves entries between users — the row is the same row, it just gains an identity. Reject the claim if the target account is already a member of that game.

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

- **`users`** — `id`, `auth_user_id` (FK to `auth.users`, null for guests), `display_name`, `is_guest`, `default_currency`, `created_at`. Unique on `auth_user_id` where not null.
- **`payout_details`** — `user_id` (PK, FK `users`), `account_name`, `sort_code`, `account_number`, `payment_reference`, `updated_at`. Separate table so it is never joined in by accident and can carry its own tight RLS. Guests may not have a row (`CHECK` against `users.is_guest` via trigger, or enforce in service + RLS).
- **`games`** — `id`, `name`, `join_code` (unique, short, uppercase, ambiguity-free alphabet), `state`, `host_id`, `currency` (ISO 4217, default `GBP`), `currency_exponent`, `stake_minor`, `created_at`, `closed_at`, `version`.
- **`game_members`** — `game_id`, `user_id`, `role`, `joined_at`, `departed_at`, `departed_unsettled`. Unique on `(game_id, user_id)`.
- **`entries`** — `id`, `game_id`, `user_id`, `entry_type`, `amount_minor`, `state`, `created_at`, `logged_by`, `verified_by`, `verified_at`, `rejection_note`, `void_reason`, `amends_entry_id`, `version`.
- **`settlements`** — `id`, `game_id`, `computed_at`, `payments` (JSONB), `discrepancy_minor`, `acknowledged_by`. Written once at close.
- **`adjustments`** — `id`, `game_id`, `user_id`, `direction` (`credit`/`debit`), `amount_minor`, `note`, `created_by`, `created_at`. Corrections against a **closed** game (decided 2026-08-23): they sit beside the original settlement, never alter it, and appear in lifetime history as their own line. Write-once, host-created, v1 renders them read-only.

`amount_minor` replaces the earlier `amount_pence` (likewise `stake_minor`, `discrepancy_minor`). The rename is the point: with per-game currency, a column called `pence` is a lie waiting to be believed. Every amount is interpreted against its game's `currency_exponent` — never against a hard-coded 2.

Constraints that carry real weight:

```sql
ALTER TABLE entries ADD CONSTRAINT amount_positive CHECK (amount_minor > 0);
ALTER TABLE entries ADD CONSTRAINT verified_fields_together
  CHECK ((verified_by IS NULL) = (verified_at IS NULL));

CREATE UNIQUE INDEX one_active_cashout
  ON entries (game_id, user_id)
  WHERE entry_type = 'cash_out' AND state = 'pending';
```

That partial unique index is the one to get right — it's what stops a player having two live cash-outs, which would otherwise silently double their settleable position. An earlier draft included `'verified'` in the predicate; that contradicted `app-logic` (a rebuy after a verified cash-out opens a fresh cash-out slot — decided 2026-08-23) and this skill's own test list, so the index now covers `pending` only. The other half of the rule is service-layer: reject a new cash-out unless every existing verified cash-out predates a later verified buy-in or rebuy — that check depends on row ordering, which an index can't express.

The old `amends_only_rejected CHECK (amends_entry_id IS NULL OR entry_type <> 'cash_out')` is **removed**. It existed when cash-outs weren't verifiable; now that they are rejectable, they must also be amendable. The rule it was reaching for — you may only amend a rejected entry — is a service-layer check, because it depends on the target row's state.

Currency immutability is enforced in the service layer and by trigger: reject any update to `games.currency` when the game has at least one entry.

`logged_by` and `user_id` are separate columns because the host may log on someone's behalf ("just put me down for another twenty" shouted across the room). The entry belongs to the player; the action belongs to whoever performed it.

## RLS

Enable RLS on every table in `public`. The backend uses the service role and bypasses it; these policies exist for direct client reads and Realtime subscriptions.

- `games`, `game_members`, `entries` — readable by any user who has a `game_members` row for that `game_id`. Write access: none. All writes go through the API, so clients get `SELECT` only.
- `payout_details` — readable by the owner, and by users who share a game with the owner where that game is not yet closed, plus a grace window of **7 days after `closed_at`** (decided 2026-08-23). Writable by the owner only. This is the one policy to review most carefully; it is the only table holding data that is harmful if it leaks.
- `users` — a member of a shared game may read `id`, `display_name`, `is_guest`. Nothing else.
- Guest tokens hit the same policies; because a guest's token names one `game_id`, add that check to the membership predicate rather than trusting the row alone.

A policy that is hard to express is a signal the read should go through the API instead. Prefer that over a clever policy nobody can audit.

## Endpoints

```
POST   /api/auth/guest                   body: {join_code, display_name} → guest token
POST   /api/auth/claim                   guest token + registered session → merge

POST   /api/games                        create (creator becomes host), body includes currency
GET    /api/games/{id}                   full state: members, entries, totals, live nets
POST   /api/games/join                   body: {join_code}
POST   /api/games/{id}/state             body: {to: GameState}
POST   /api/games/{id}/transfer-host    body: {user_id}
POST   /api/games/{id}/leave             settled position only, else departed_unsettled
POST   /api/games/{id}/members/{user_id}/remove   host only
PATCH  /api/games/{id}/currency          host only, zero entries only

POST   /api/games/{id}/entries           log buy-in / rebuy / cash-out
POST   /api/entries/{id}/verify
POST   /api/entries/{id}/reject          body: {note?}
POST   /api/entries/{id}/void            body: {reason}
POST   /api/entries/{id}/amend           body: {amount_minor}

GET    /api/games/{id}/settlement        computed, verified entries only
POST   /api/games/{id}/close             body: {acknowledge_discrepancy?}

GET    /api/users/me                     profile + default currency
PUT    /api/users/me/payout-details      owner only
GET    /api/games/{id}/payout-details    details for members of this game, masked
GET    /api/users/me/history             lifetime stats, grouped by currency
```

`leave` and `members/{user_id}/remove` were missing from an earlier draft of this list even though `app-logic`'s permissions checklist requires both — added 2026-08-23 (`app-logic` wins).

State changes are `POST` to a named action rather than `PATCH` on a field. A rejection isn't an edit — it's an event with an actor, a time and a reason, and modelling it as a field update loses all three.

`GET /api/users/me/history` returns totals **grouped by currency**, never summed across them. There is no FX in this system.

## The two totals and live nets

`GET /api/games/{id}` returns all three figures, because they answer different questions:

```python
chips_on_table = sum(buy_ins  where state in (pending, verified)) \
               - sum(cash_outs where state in (pending, verified))

settleable = sum(verified buy_ins) - sum(verified cash_outs)   # per player, signed
pending_delta = per-player value of that player's pending entries
```

`chips_on_table` includes pending because the chips are physically in front of the player regardless of whether the host has tapped a button — it's the figure to reconcile against a physical count. `settleable` is the per-player **live net** the clients display. `pending_delta` is returned separately so a client can render "£40 awaiting verification" without recomputing, and must never be added into the net server-side.

Live nets are pushed, not polled: clients subscribe to `entries` for the game over Supabase Realtime and refetch the game on change. The subscription is a cache-invalidation signal — never derive a net from the Realtime payload alone, because a client that computes its own settleable figure is the second implementation this skill exists to prevent.

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
        payments.append(Payment(from_user=du, to_user=cu, minor=amount))
        owes[i], owed[j] = (du, da - amount), (cu, ca - amount)
        if owes[i][1] == 0: i += 1
        if owed[j][1] == 0: j += 1
    return payments
```

Greedy largest-against-largest doesn't guarantee the minimum number of transfers (NP-hard) but runs instantly and typically gives three or four payments for eight players.

Assert `sum(nets.values()) == 0` before settling. A non-zero sum is a derivation bug, not a rounding artefact — raise rather than paper over it.

On close, persist the result to `settlements`. The settlement a player saw when they handed over cash must remain retrievable even if an adjustment is recorded later.

**Never persist payout details into the settlement snapshot.** Payments reference user ids; bank details are looked up live against `payout_details`. Someone who removes their account number should not have it survive in a JSONB blob from March.

## Enforcement points

Do these in the service layer, inside a transaction, with the game row locked (`SELECT ... FOR UPDATE`):

**Close** — reject if any entry in the game is `pending`. This is the most important gate in the system; a game closing with unresolved claims produces a settlement built on incomplete data.

**Reconciliation** — on close, if verified buy-ins ≠ verified cash-outs, require `acknowledge_discrepancy` and record the amount plus the acknowledging user. Never round it away silently.

**State transitions** — validate against the allowed map. `settling → running` is permitted ("one more orbit" always happens); `closed → anything` never is. Corrections after close become a new adjustment record referencing the closed game.

**Verify / reject** — host only, on buy-ins **and cash-outs** alike, game `running` or `settling`.

**Void** — host only, verified entries only, reason required. A verified entry can't be un-verified, only voided; reversal is an explicit recorded act, not an undo.

**Amend** — the entry's owner only, on rejected entries only, any entry type. Creates a new `pending` entry with `amends_entry_id` set. Never mutate the rejected row's amount.

**Cash-out uniqueness** — reject a cash-out when the player already has one `pending` or `verified`. The partial index will stop it anyway; catch it in the service so the client gets `cashout_already_live` rather than a constraint error.

**Currency** — settable only while the game holds zero entries, host only.

**Guest limits** — reject guests on: hosting, verifying, host transfer, payout details, lifetime history, and any game other than the one in their token.

**No auto-verification.** Not below a threshold, not after a timeout, not for the host's own entries. An auto-verified row is indistinguishable in the data from a checked one, which devalues every verified row.

Host self-verification is allowed (requiring a second person deadlocks when the host is the only one paying attention) but `verified_by == user_id` must stay queryable so a discrepancy can be traced.

## Concurrency

Two players logging at once is routine and conflict-free — entries are append-only inserts.

Verification races are real: a host verifies while the player amends the same entry. Every entry carries a `version` column; mutating endpoints take `if_version` and return `409` with the current row when it doesn't match. The client refetches and retries.

Close and state transitions take a row lock on `games` for the duration of the transaction, so two hosts can't close concurrently and produce two settlements.

## Errors

Return structured problems, not bare strings, since clients branch on them:

```json
{"error": "pending_entries_block_close", "detail": {"count": 3}}
```

Codes worth having: `pending_entries_block_close`, `reconciliation_mismatch`, `version_conflict`, `not_host`, `guest_not_permitted`, `invalid_state_transition`, `entry_not_rejected`, `cashout_already_live`, `currency_locked`, `game_closed`.

`reconciliation_mismatch` is a normal, expected condition rather than a failure — it means chips need recounting. Don't dress it as a server error.

## Testing

Test against real Postgres — a Supabase branch, or `supabase start` locally. Never SQLite: the partial unique index, `CHECK` constraints and RLS policies don't exist there, and those are exactly what's being tested.

Coverage is weighted toward anything that could make the numbers wrong. Cover at minimum:

- A game with pending entries refuses to close.
- Rejected and void entries are excluded from settlement; pending entries are excluded from settlement but included in chips-on-table.
- A pending cash-out does not move a player's live net; verifying it does.
- Amend creates a new row and leaves the rejected row untouched — for a cash-out as well as a buy-in.
- A second live cash-out is rejected, and a cash-out after a verified one plus a rebuy is allowed.
- Nets sum to zero across a full game; settlement payments reconcile.
- Version conflict on concurrent verify + amend returns `409`.
- A non-host calling verify gets `403`; a guest calling verify gets `403`.
- A guest token scoped to game A is rejected on game B.
- Currency cannot change once an entry exists; a JPY game (exponent 0) round-trips correctly.
- Payout details are unreadable by a non-member, and absent from the settlement snapshot.
- Money round-trips exactly across large values and many entries.
- Reflected schema matches the SQLAlchemy models.

## Verifying it runs — check the logs

A passing test suite says the code does what you told it to. The logs say what the platform actually did. Check them; "it returned 200" is not the same as "it worked".

**After every migration or RLS change**, without exception:

- `get_advisors` for both `security` and `performance`. A new table with RLS disabled, or a policy that re-evaluates `auth.uid()` per row, shows up here and nowhere else.
- `query_logs` on the `postgres` service for errors during the apply. A migration can succeed and still log constraint or permission failures behind it.

**After running a flow against the API**, read the logs rather than trusting the response:

- `query_logs` on `postgres` — slow queries, constraint violations, deadlocks, lock waits on the `FOR UPDATE` in close.
- `query_logs` on `auth` — token verification failures, expired sessions, and refused guest tokens. When a client reports being logged out at the table, this is where the answer is.
- `query_logs` on `postgrest` — direct client reads that RLS refused. A silently empty ledger for a legitimate player is an RLS bug, and it reads as a `42501` here while the client just shows nothing.
- `query_logs` on `realtime` — subscriptions that failed to establish or were dropped. A live net that stopped updating is usually here, not in the frontend.

The failure this catches: a permission bug that returns an empty list instead of an error. The API looks healthy, the tests pass against the service role which bypasses RLS, and only the logs show the policy denying the read.

**When the backend is deployed** (it isn't yet — see "Running it"), the same discipline applies to the host's logs: build logs for a failed deploy, runtime logs for what happened after, and runtime errors for unhandled exceptions. For a Vercel deployment that means `get_deployment_build_logs`, `get_runtime_logs` and `get_runtime_errors` against the deployment id. Do not add deploy configuration to make this true — the target is still undecided.

Never paste log output containing tokens, connection strings or payout details into a PR, an issue or a chat. Quote the error, not the record.

## Working conventions

Build in this order: SQL migration, SQLAlchemy model, Pydantic schema, service function with its test, then the route. The service function is where invariants live; written after the route it tends to get shaped by what's convenient to expose.

Keep all rule enforcement in `services/`. Routes parse, authorise and delegate — they contain no business logic. Settlement lives in `services/settlement.py` and is pure: nets in, payments out, no database access.

Anything touching schema, permissions, auth or money goes on a branch with a PR — see `repo` for what counts as major.

Flag rather than guess. If a task implies a rule `app-logic` doesn't cover, raise it instead of inventing an answer that then hardens into schema.
