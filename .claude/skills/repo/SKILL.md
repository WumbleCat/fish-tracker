---
name: repo
description: How the fish-tracker monorepo is laid out and how work lands in it — folder structure for backend/web/mobile/supabase, where skills live, git branching and pull-request policy (what counts as a major change), commit conventions, environment variables and secrets, and how migrations are applied to Supabase. Use this skill before creating files or folders, before committing or pushing, when deciding whether a change needs its own branch and PR, when adding an environment variable, or when anything about project structure, tooling or git flow is in question.
---

# fish-tracker — repository and workflow

How the project is laid out and how changes get in. Domain rules are in `app-logic`; implementation guidance in `backend`, `desktop-design` and `mobile-design`.

## Layout

```
fish-tracker/
├── backend/            FastAPI service — the ledger authority (see `backend`)
│   ├── app/
│   │   ├── routes/     parse, authorise, delegate — no business logic
│   │   ├── services/   every invariant lives here
│   │   ├── models/     SQLAlchemy, hand-kept in step with the SQL migrations
│   │   └── schemas/    Pydantic v2
│   └── tests/          pytest against real Postgres
├── web/                Vite + React desktop client (see `desktop-design`)
│   └── src/
│       ├── lib/        money.ts, ledger.ts — all arithmetic lives here
│       ├── components/
│       └── routes/
├── mobile/             Expo + React Native client (see `mobile-design`)
│   └── src/
│       ├── lib/        money.ts, ledger.ts
│       └── app/        expo-router screens
├── supabase/
│   └── migrations/     SQL — the single source of truth for schema and RLS
├── .claude/
│   └── skills/         project skills, one folder each, each holding SKILL.md
├── .agents/
│   └── skills/         vendored third-party skills, managed by skills-lock.json
└── CLAUDE.md           entry point: what this is, which skill governs what
```

One repo, three deployable things, no shared package between the clients. `web/src/lib/money.ts` and `mobile/src/lib/money.ts` are allowed to be near-duplicates: extracting them before there is a third consumer produces a module that gets bent to fit whichever client changed most recently, and money formatting is the wrong place to absorb that.

## Skills

Project skills live at `.claude/skills/<name>/SKILL.md`. That path is what the Claude CLI loads, and the folder name is the skill's name — keep the `name:` in the frontmatter identical to the folder.

Two rules that matter when adding or renaming one:

- **Names must not collide with built-in skills.** The web frontend skill is `desktop-design`, not `design`, because `design` is a built-in. A collision means the wrong instructions load silently.
- **The `description:` is the only thing read when deciding whether to load a skill.** Write it as trigger conditions — the tasks and phrasings that should pull it in — not as a summary of the contents.

`.agents/skills/` holds vendored skills from `npx skills add`, tracked by `skills-lock.json`. The Claude CLI does not read that directory; it is the package manager's, and its contents are consulted by hand or copied deliberately. Don't edit those files — an update overwrites them.

## Git flow

Work happens on branches off `main`. **Every major change gets its own branch and a pull request.**

### Major — branch and PR, always

- Anything touching money: amounts, settlement, reconciliation, currency, totals
- Schema, migrations or RLS policies
- Auth, permissions, guest handling, or session/token behaviour
- New endpoints, or changes to an existing endpoint's shape
- New screens, or changes to how a ledger figure is displayed
- Dependency additions and version bumps
- Tooling, CI, environments, deployment config
- Changes to `app-logic` or to the rules in any skill — those are the specification

### Minor — commit directly to the working branch

- Typos, comments, formatting, copy tweaks
- Docs that don't change a rule
- Test additions that don't change behaviour
- Small refactors inside one file with no behaviour change

The test: if this were wrong, could the ledger show a number that isn't true, or could someone do something they shouldn't? Then it's major. When it's genuinely borderline, branch it — a PR that turns out to be trivial costs a minute, and the reverse doesn't.

### Branch and commit conventions

```
feat/…    new capability          fix/…     bug fix
chore/…   tooling, deps, config   docs/…    documentation and skills
```

Commits are imperative and scoped: `backend: reject second live cash-out`. One logical change per commit; one concern per PR.

### PR bodies

State what changed and why, and — for anything major — three things explicitly:

1. **Which skill rules it touches**, by name. If it changes a rule rather than implementing one, the skill edit belongs in the same PR.
2. **Test evidence** for money paths: which tests cover it, and their result. "Tests pass" without naming the ones that matter isn't evidence.
3. **Migration and rollback**, when schema is involved.

Never push directly to `main`. Never force-push a branch someone else may have pulled.

## Environments

Secrets live in `.env` files, which are gitignored. `.env.example` is committed and lists every variable with a placeholder — a new variable is added to both in the same commit, or the next person's checkout doesn't run.

| Variable | Where | Notes |
|---|---|---|
| `SUPABASE_URL` | backend, web, mobile | Project URL |
| `SUPABASE_ANON_KEY` | web, mobile | Public by design; RLS is what protects the data |
| `SUPABASE_SERVICE_ROLE_KEY` | backend only | Bypasses RLS. Never ships to a client, never logged |
| `SUPABASE_JWT_SECRET` | backend only | Verifies Supabase tokens, signs guest tokens |
| `DATABASE_URL` | backend only | Session-pooler connection string |

Client-side variables need the framework's public prefix (`VITE_` for web, `EXPO_PUBLIC_` for mobile). Anything without that prefix must never be referenced from client code — check the prefix before adding a variable, not after a key leaks into a bundle.

There is **no deployed environment yet**. The backend runs locally against the hosted Supabase project:

```
cd backend && uv run uvicorn app.main:app --reload --port 8000
cd web     && npm run dev
cd mobile  && npx expo start
```

Don't add Dockerfiles, hosting config or deploy pipelines until the deployment target is chosen. Vercel and Supabase MCP servers are configured in `.mcp.json` and are for inspecting the project, not a decision that anything is deployed there.

## Migrations

SQL files in `supabase/migrations/`, applied with the Supabase CLI. Never edit a migration that has been applied to the shared project — write a new one.

Prefer a Supabase **branch** for anything risky, and check `get_advisors` for RLS and security findings after applying policy changes. When a migration and the SQLAlchemy models change together, they go in the same PR: the schema-drift test exists to catch the case where they don't.

## Working conventions across the repo

- Amounts are integer minor units everywhere, in every language, at every boundary.
- The backend is the only authority. Clients render; they never derive settlement.
- Nothing in the ledger is deleted, in code or by hand in the database.
- When a task implies a rule that `app-logic` doesn't cover, raise it instead of inventing one that then hardens into schema.
