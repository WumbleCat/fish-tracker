---
name: test-sweep
description: Run fish-tracker's tests end to end to find missing logic, silent bugs and broken invariants, and to prove the backend holds up under concurrent load. Use whenever asked to "run the tests", "check for bugs", "see if anything's broken", "look for missing logic", "load test", "stress test", "check the server holds up", or before merging a branch that touched money, entries, verification, settlement, schema or auth. Also use when a change is finished and nobody has said how to check it — this is the check.
---

# fish-tracker — test sweep

Two questions, answered in order:

1. **Is the logic right?** Every invariant in `CLAUDE.md` is enforced somewhere in `backend/app/services/` and asserted somewhere in `backend/tests/`. A gap in either is a finding.
2. **Does it hold under load?** The ledger is written to by several phones at once, on a home Wi-Fi, mid-game. Correct-when-serial and correct-when-raced are different claims.

Run the layers in order. A failure at one layer makes the layers above it uninformative — fix or report before continuing, don't push past it.

## Layer 0 — preflight

The backend suite runs against **real Postgres**, never SQLite: the partial unique index, CHECK constraints and triggers are exactly what's under test.

```bash
docker ps                       # Docker Desktop must be running first
npx supabase status             # expect API 54321, DB 54322
npx supabase start              # if it isn't up
npx supabase db reset           # applies supabase/migrations/ to a clean DB
```

If Docker isn't running, say so and stop — do **not** point the suite at the hosted Supabase project as a substitute. The tests truncate tables.

```bash
uv sync --directory backend     # backend deps incl. pytest, httpx
```

`web/node_modules` and `mobile/node_modules` are usually already present; `npm ci` in each if not.

## Layer 1 — backend correctness (the one that matters)

```bash
cd backend && uv run pytest -q
```

Failure triage — what a failing file is telling you:

| File | What broke |
|---|---|
| `test_money_roundtrip.py` | a float or a rounding step entered the money path |
| `test_settlement_pure.py` | the settlement algorithm itself, no DB involved |
| `test_close_and_settlement.py` | settlement gating, reconciliation, or close-state rules |
| `test_concurrency.py` | optimistic-locking / `if_version` handling |
| `test_permissions.py`, `test_guest_scope.py` | someone can now touch a record they shouldn't |
| `test_schema_drift.py` | SQLAlchemy models and `supabase/migrations/` disagree |
| `test_entries.py`, `test_cashout_rules.py`, `test_seats.py` | entry lifecycle rules |

Read the failure before touching code. A test failing after a deliberate rule change means the test needs updating *and* `app-logic` needs updating; a test failing after an unrelated change means the change is wrong.

Useful narrowing: `uv run pytest -q -x --lf`, then `uv run pytest tests/test_entries.py -k verify -vv`.

## Layer 2 — clients

```bash
cd web    && npm test          # vitest — money.ts, ledger.ts, components
cd mobile && npm test          # jest-expo
```

Client arithmetic is display-only. If a client test proves a number the backend never returned, that test is asserting a second source of truth and is itself the bug.

## Layer 3 — types and build

```bash
cd web && npm run build        # tsc -b + vite build
cd mobile && npx tsc --noEmit
```

Type errors here are usually a backend response shape that changed without the clients following.

## Layer 4 — missing-logic audit

Tests only catch what someone thought to assert. Walk this list against the diff (`git diff main...HEAD`) and check each claim in `backend/app/services/`, not in the routes:

- **Integer minor units end to end.** `grep -rn "float\|/ 100\|\* 100\|toFixed\|parseFloat" backend/app web/src mobile/src` — every hit is either a formatter at the display edge or a bug.
- **Claims vs facts.** No path sets an entry to `verified` except an explicit host action on one entry. No auto-verify, no bulk-verify, no verify-on-close.
- **Nothing is deleted.** No `DELETE` or destructive `UPDATE` over ledger rows outside test fixtures: `grep -rn "delete(\|DELETE FROM" backend/app`.
- **Backend is the only authority.** No settlement or net computed in `web/src` or `mobile/src` beyond formatting what the API returned.
- **Reconciliation surfaces.** An unbalanced game must report the imbalance before any payment instruction is rendered.
- **Every new endpoint has an authorization test.** New route in `backend/app/routes/` with no matching case in `test_permissions.py` or `test_guest_scope.py` is a finding.
- **Every new state transition has a rejection test.** The illegal transition must be asserted to fail, not merely unasserted.

Report gaps; do not silently invent rules to close them. Anything about what the ledger *means* is settled by `app-logic`, which wins over every other skill.

## Layer 5 — server under stress

Proves three things the serial suite cannot: the connection pool survives concurrency, concurrent writes neither duplicate nor vanish, and a verify race produces exactly one winner.

Two terminals. Backend must be running against the local stack:

```bash
cd backend && uv run uvicorn app.main:app --port 8000
```

Then:

```bash
cd backend && uv run python ../.claude/skills/test-sweep/scripts/stress.py
```

Useful knobs: `--players 12 --rounds 8 --concurrency 64 --soak-seconds 20`, and `--base-url` if the server isn't on `:8000`. The script refuses any database URL that isn't loopback — it truncates.

What it asserts, and what a failure means:

| Phase | Assertion | A failure means |
|---|---|---|
| health flood | every `/api/health` returns 200 with `db: ok` | pool exhaustion or connection churn under load |
| entry storm | rows created == rows requested, no duplicates | lost writes, or a retry path creating doubles |
| verify race | N concurrent verifies of one entry → exactly one 200, rest 409 | optimistic locking is not actually locking; an entry could be verified twice |
| settle-up | two simultaneous cash-outs per player → one 201, one `cashout_already_live` | the one-live-cash-out-per-sitting rule loses a race |
| read soak | zero 5xx, zero connection errors over the soak window | leaked connections or an unbounded query under repetition |
| ledger | nets sum to zero; nothing left pending | the pot was dealt out in full, so anything else is an imbalance the ledger failed to surface |

The run ends by printing the ledger it produced — every player's buy-ins,
cash-outs and net, then the biggest winner and biggest loser, then the game
totals. `--json` dumps the same list machine-readably.

```
  Player             buy-ins    cash-outs          net     pending
  Player 1            £60.30       £26.86      −£33.44           —
  ...
  biggest winner   Player 8      +£53.66
  biggest loser    Player 1      −£33.44
```

The net column is the API's own `nets[].settleable_minor`; the script tallies
buy-ins and cash-outs from the verified entries the API returned but never
subtracts one from the other to get a net. If those two ever disagree, that
is the finding — a stress script that computed its own net would hide it.
Pending is shown in its own column and never folded in.

Latency numbers are printed for context, not asserted — this is a home game, not a trading venue. Correctness under concurrency is the pass/fail; p95 is a note.

Exit code is non-zero on any assertion failure. Treat a stress failure as equal in severity to a Layer 1 failure: both mean the ledger can be wrong.

## Reporting

Report in this shape, and prefer the honest partial result over a tidy one:

```
Layer 1 backend   142 passed, 0 failed
Layer 2 clients   web 38 passed · mobile 21 passed
Layer 3 types     clean
Layer 4 audit     1 finding — POST /api/games/{id}/close has no permission test
Layer 5 stress    PASS — 0 lost writes, verify race 1 winner / 63 conflicts, p95 41ms
```

State which layers were skipped and why (Docker down, no server running) rather than implying a clean sweep. A skipped layer is not a passing layer.

Fixing what you find: a failing test on money, settlement, permissions or schema is a **major change** — branch and PR per `repo`. Read `app-logic` before changing any rule, and `backend` before changing enforcement.
