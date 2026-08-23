# fish-tracker

A ledger for real home poker games: players log their own buy-ins, rebuys and cash-outs, the host verifies each one, and the app settles who pays whom at the end. Built for an actual weekly game, so correctness beats convenience wherever the two conflict.

Three clients over one authority: a FastAPI backend on Supabase, a desktop web app for reviewing and settling, and a phone app for capturing entries at the table.

## Which skill governs what

| Working on | Read |
|---|---|
| Game rules, verification, settlement, permissions — anything about what the ledger *means* | `app-logic` |
| API, schema, migrations, RLS, auth, settlement computation | `backend` |
| Laptop web UI in `web/` | `desktop-design` |
| Phone UI in `mobile/` | `mobile-design` |
| Folder layout, git flow, PRs, env vars, migrations | `repo` |

`app-logic` is the specification. Where another skill disagrees with it, `app-logic` wins and the other one needs fixing.

## The rules that survive every change

- **Money is integer minor units.** Never a float, in any language, at any boundary. Amounts are positive; direction comes from the entry type.
- **Claims and facts are different things.** A pending entry is what a player says; a verified entry is what the host confirmed. Only verified entries settle. Never auto-verify, never bulk-verify.
- **Nothing is deleted.** Rejection, voiding and amendment are new records or state changes. The audit trail is the product.
- **The backend is the only authority.** Clients render what it returns and compute no settlement of their own.
- **Reconciliation is surfaced, never rounded away.** A game that doesn't balance says so before any payment is shown.

## Layout

```
backend/    FastAPI service (uv, Python 3.11+)
web/        Vite + React + TypeScript
mobile/     Expo + React Native + TypeScript
supabase/   SQL migrations — source of truth for schema and RLS
```

Nothing is deployed yet; everything runs locally against the hosted Supabase project. See `repo` for commands, environment variables and the branch/PR policy — major changes always get a branch and a pull request.

## Out of scope

Tournaments, FX conversion, cross-currency totals, chip-denomination tracking, per-hand history, staking. If a task implies one of these, raise it rather than building it.
