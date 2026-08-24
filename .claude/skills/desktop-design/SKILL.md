---
name: desktop-design
description: Build the desktop web frontend for fish-tracker, the poker buy-in and cash-out ledger — React + Vite + TypeScript, dense tables, keyboard-first entry, sign-in and guest join, live net positions, currency switching, settlement and host payout details. Use this skill whenever work touches the web/laptop UI, including new screens, the ledger table, settlement views, charts, auth screens, or any styling and layout decision in `web/`. Trigger it even when the request sounds small ("add a column", "fix this modal", "show lifetime net") — the money-handling and reconciliation rules here apply to every change, and getting them wrong corrupts the ledger silently. For phone UI use `mobile-design` instead; the two are deliberately different products.
---

# fish-tracker — desktop web frontend

The desktop client for tracking buy-ins, rebuys and cash-outs across poker sessions, and settling up who pays whom at the end. Lives in `web/`.

This skill covers the frontend only. It never talks to a database directly — it consumes the API described in `backend`. If a task needs schema or backend changes, say so and stop rather than reaching past the boundary. Domain rules are in `app-logic`; this renders them and never reimplements them.

## Desktop is not mobile

`mobile-design` covers the phone app, and the split is a product decision, not a responsive breakpoint:

| | Desktop (this skill) | Mobile (`mobile-design`) |
|---|---|---|
| Used | After the game, and by the host during it | At the table, mid-hand, one-handed |
| For | Reviewing, correcting, analysing, settling | Capturing entries in three seconds |
| Layout | Dense multi-column, twenty rows visible | One column, thumb zone, big targets |
| Input | Keyboard-first, inline editing | Tap targets, numeric keypad, bottom sheets |

Do not use bottom sheets, swipe gestures or thumb-zone layouts here — they read as broken on a laptop. Equally, do not stretch this layout onto a phone; that is what the other app is for.

## The three rules that override everything

These are not style preferences. Breaking any of them produces a ledger people can't trust, which is the only thing the product sells.

**1. Money is an integer number of minor units. Never a float.**

`0.1 + 0.2 !== 0.3`. A ledger that drifts by a penny per session is worse than no ledger, because it looks authoritative. Every amount crossing a component boundary is `amountMinor: number` plus the currency it belongs to. Convert to a display string only at the moment of rendering, using `dinero.js`. Never parse a currency string back into a float — parse to minor units with integer arithmetic.

```ts
import { dinero, toDecimal } from 'dinero.js';
import * as currencies from '@dinero.js/currencies';

export const money = (amountMinor: number, code: string) =>
  dinero({ amount: amountMinor, currency: currencies[code as keyof typeof currencies] });

export const fmt = (amountMinor: number, code: string) => {
  const abs = money(Math.abs(amountMinor), code);
  return `${amountMinor < 0 ? '−' : ''}${symbolFor(code)}${toDecimal(abs)}`;
};
```

Use the true minus sign `−` (U+2212), not a hyphen. It aligns with digit width in tabular figures; a hyphen doesn't.

**2. Balances are derived, never stored in state.**

The API returns entries and the totals computed from them. Render those. Never keep a `balance` or `net` field in Zustand or component state that you update alongside an entry. A cached balance and its underlying entries will diverge, and the divergence appears at 2am when people are handing over cash.

Where a figure genuinely must be computed client-side, compute it in `lib/ledger.ts` with `useMemo` from the entry list — never incrementally, never in an effect.

**3. Reconciliation is surfaced before settlement, always.**

Total verified buy-ins must equal total verified cash-outs. When they don't, chips are missing or miscounted. Render reconciliation as a **fixed counter block** above the payments — BUY-INS / CASH-OUTS / GAP rows (plus PENDING when nonzero), identical in every state, with a short/over pill and no prose sentences (decided 2026-08-24). A nonzero GAP row gates the payment list until an explicit acknowledgement checkbox is ticked. Never silently round the difference away, and never let the settlement view render as if the numbers balance when they don't.

## Stack

| Concern | Choice |
|---|---|
| Build | Vite + React 18 + TypeScript (strict) |
| Routing | React Router (or TanStack Router) |
| Styling | Tailwind CSS |
| Component primitives | Radix UI |
| Icons | `lucide-react` |
| Server state | TanStack Query |
| Realtime | `@supabase/supabase-js` subscription → query invalidation |
| Auth | `@supabase/supabase-js` for sign-in; guest tokens from the API |
| Client state | Zustand — UI state only, never derived money |
| Tables | TanStack Table |
| Forms | `react-hook-form` + `zod` |
| Money | `dinero.js` v2 |
| Dates | `date-fns` |
| Charts | Recharts |

Radix over a full component library because the ledger table and settlement views are custom anyway; what's actually needed is accessible dialog, popover, dropdown and tooltip primitives, not someone else's opinion about card padding.

## What desktop is for

The mobile app exists to capture entries fast during a game. The web app exists to review, correct and analyse — and for the host to run verification with a real keyboard. Design for that.

Concretely, lean into:

- **Density.** Show twenty ledger rows at once. Whitespace that feels generous on a phone wastes a laptop screen and forces scrolling through data users are trying to compare.
- **Keyboard entry.** Someone reconciling a session enters many amounts in sequence. Every entry form is fully keyboard-operable: `Tab` moves through fields, `Enter` submits and immediately focuses the next row's first input, `Esc` cancels. If a task requires reaching for the mouse between entries, the design has failed.
- **Multi-column layout.** Session detail sits beside the running settlement, so the effect of a verification is visible without navigation.
- **Hover affordances.** Row actions (verify, reject, void) appear on hover rather than occupying permanent space.
- **Inline amend.** Correcting a mistyped buy-in happens in the table cell, not in a modal — remembering that an amend creates a *new* pending row rather than editing the old one, and the table must show both.

## Keyboard shortcuts

Implement these globally; they are the main reason someone opens the web app rather than the phone.

| Key | Action |
|---|---|
| `n` | New entry in current session |
| `r` | Rebuy for selected player |
| `c` | Cash out selected player |
| `v` | Verify selected entry (host only) |
| `x` | Reject selected entry (host only) |
| `/` | Focus search |
| `↑` `↓` | Move row selection |
| `Enter` | Open/confirm selected row |
| `Esc` | Cancel edit / close dialog |
| `?` | Shortcut reference |

Suppress all of these while a text input has focus, or typing "n" in a player name opens a dialog.

There is deliberately **no bulk-verify shortcut**. Verification is per entry; a key that verifies everything is the same mistake as a "verify all" button.

## Auth screens

- **Sign in / sign up** — email + password and magic link, via Supabase Auth. One screen, toggling between modes, not two routes that lose typed input when you switch.
- **Join with a code** — reachable without an account. Entering a code and a display name gets you into the game as a guest. This path must be obvious from the landing screen: the person using it is standing in someone's kitchen with the code read out to them.
- **Guest state is visible, never nagging.** Show a quiet "playing as guest" marker with a single "save my history" action. Do not interrupt entry logging with a sign-up prompt; a blocked entry is a hole in the ledger.
- **Guest limits are shown as absence, not as errors.** A guest simply doesn't see host controls, payout-details fields or lifetime history. Don't render a disabled control with a "guests can't do this" tooltip.

## Currency

A currency bar in the app header sets the user's default currency for **new** games and the display currency for their own lifetime history.

- Within a game, the currency is the game's, always, and it is not switchable once entries exist. Show the game currency in the session header so nobody misreads a EUR ledger as sterling.
- The bar must never appear to convert an existing ledger. If a user changes it while viewing a game, nothing in that game's numbers moves — and the UI should make that obvious rather than surprising.
- Read the exponent from the game rather than assuming 2. A JPY game has no decimal places and must not render `¥1000.00`.
- Lifetime history is grouped per currency, never summed across currencies. There is no FX in this product.

## Numeric display

Every figure that appears in a column uses tabular numerals: `font-variant-numeric: tabular-nums`, or Tailwind's `tabular-nums`. Digits then align vertically, which makes an anomalous total visible at a glance. Proportional numerals hide exactly the errors this app exists to catch.

Sign is carried by the `+`/`−` character first and colour second. Green-for-up and red-for-down is conventional and worth keeping, but it must never be the only signal — that pair is precisely what collapses for red-green colourblind users.

Never soften a loss. Rounding a downswing toward zero, or styling it in a gentler colour than a win, makes the ledger flattering and therefore useless.

**Pending amounts read as provisional.** A pending entry is rendered in a muted, clearly-distinct treatment from verified, and its value never merges into a player's net figure — it sits beside it as "+£40 awaiting verification". Someone glancing at the table must be able to tell facts from claims without reading a legend.

## Screens

- **Sessions list** — date, stake, player count, currency, total pot, reconciliation status. Sortable, filterable by date range and player.
- **Session detail** — the primary screen. Ledger table (player, buy-ins, rebuys, cash-out, **live net**, pending), chips-on-table and settleable totals, host verification queue, settlement panel alongside.
- **Verification queue** — the host's working surface: every pending entry, oldest first, each with verify / reject / reject-with-note. One row at a time, keyboard-driven.
- **Player profile** — lifetime net per currency, sessions played, best and worst results, average buy-in, rebuy rate, outstanding balance, cumulative net line chart.
- **Settlement** — the ordered list of who pays whom, payout details, and a copy-to-clipboard summary for pasting into a group chat.
- **Account settings** — display name, default currency, and payout details.

## Instant UI, one ground truth (decided 2026-08-24)

Every write lands on screen synchronously and the server is asked in the background — but the server always has the last word, and no money figure ever comes from anywhere else. The mechanics live in `lib/optimistic.ts`, `lib/serialize.ts` and `routes/Session.tsx`:

- **Inserts** (log, amend) show a row at once under a `client_key` the client generated with `crypto.randomUUID()` and sent with the request. `EntryOut` echoes it, lists key on `client_key ?? id`, and `mergeEntries` drops the optimistic row the moment the server row with the same key arrives — no flicker, no duplicate. Optimistic rows are held in local state and merged at render, never written into the query cache, so a stale refetch cannot erase them.
- **State changes** (verify, reject, void) are an *overlay*, not a change to `state`: the row reads "verifying…" and leaves the verification queue at once, while its `state` — and every figure derived from it — stays what the server last said. The overlay comes off only after the reconciling refetch has landed, so a row never flickers back.
- **Money is never optimistic.** Nets, totals, the Pending column and the settlement are exactly what the API last returned, shown with a "syncing…" marker while a write is in flight. `close` is not optimistic at all — the settlement people hand over cash against is only ever the server's answer. Create/join navigate to a server-issued id and are made instant by shell-first rendering instead.
- **Failure rolls back to the exact prior state and says what was undone** — "Undid verify of £20.00 buy-in for Bob — version conflict." A rolled-back entry offers *Restore to form*.
- **Writes to the same resource are serialised** (`serialize(key, task)`): three rapid clicks reach the server in order; a second click on an in-flight row is a no-op. In-flight reads are cancelled before a write is applied.
- **Reconcile on settle**: every mutation invalidates the game and settlement queries; a live game also polls every 5 s as a safety net under Realtime.
- **Navigation renders the shell first** from whatever the cache knows (the sessions list summary), and session rows and nav links prefetch on hover/focus.

## Live nets

The net column updates for everyone at the table as the host verifies. Subscribe to the game's entries via Supabase Realtime and use the event to invalidate the TanStack Query cache — then render what the refetch returns. Never compute a net from a Realtime payload; that is a second implementation of settlement logic wearing a disguise.

A player still in the game shows their buy-ins as a negative net. Don't blank it, dash it, or label it "in progress" — it's accurate, and it's the number they'll be asked about.

## Settlement rendering

The API returns payments. The frontend renders them and does not recompute them — two implementations of the settlement algorithm will disagree eventually, and the one users see should not be the second-best copy.

Render as a simple ordered list, `payer → payee → amount`. Resist the urge to draw a network graph; people want to read who to hand notes to, not admire a visualisation.

## Payout details

Home games settle through the host as banker, so the host's bank details need to be one glance away at the moment people are paying up.

- **Settlement panel** holds the primary presentation: an account block for the host — account name, sort code, account number — with a copy button per field and a copy-all. This is the placement to build first.
- **Session header** carries a compact "pay the host" affordance (a popover, not a permanent block) so someone can settle up before the game formally closes.
- **Payment rows** show the payee's details inline where that payee has provided them, since not every payment goes to the host.
- **Above the verification queue** (host only, added 2026-08-24) sits a bank-details card for the player in focus — the focused queue entry's player, else the ledger selection — as fixed rows (account name, sort code, account number; reference for non-GBP; Revolut when set) with a copy button at the end of each. It renders only when that player has shared details; otherwise nothing. The host pays out from here when verifying a cash-out.
- **Non-GBP games** show the free-text payment reference instead of sort code / account number. Don't render UK bank fields for a game in euros.

Handling rules, which are not negotiable:

- Account numbers are **masked by default** (`••••1234`) with an explicit reveal. Copy works without revealing — that's the common case.
- Never log, never send to analytics or error reporting, never put in a URL, never render into a screenshot-friendly summary that gets pasted into a group chat. The clipboard summary of a settlement contains names and amounts, not bank details.
- Only render what the API returns for this game. If the API doesn't return details for someone, show nothing — never a placeholder that implies they're missing something.

## Empty and error states

- **No sessions yet** — invitation to create one, not an apology.
- **Session with no entries** — prompt to add players, with the shortcut hint visible.
- **Reconciliation mismatch** — never an error state. It's a normal, expected condition that needs surfacing and resolving, so it reads as a warning with a clear next action ("recount chips" / "log the missing rebuy").
- **Version conflict (409)** — the entry changed under you. Refetch, show what it is now, and let the user redo the action. Never retry silently: the thing they were verifying may no longer be the thing they read.
- **API failure** — say what failed and offer retry. Never discard unsaved entry data on a failed write; keep it in the form and let the user retry.

## Testing

Vitest plus React Testing Library. Prioritise these, because they're where a silent corruption would live:

- Money formatting across zero, negative, large values, and a zero-exponent currency.
- Net computation from an entry list, including void, rejected and pending entries.
- Pending amounts never merge into a net figure.
- Reconciliation detection — a session that doesn't balance must be flagged.
- Keyboard flow: entering three consecutive buy-ins without the mouse; verifying three entries without the mouse.
- Guest sessions render no host controls and no payout fields.
- Payout details render masked, and the settlement clipboard summary contains no bank details.

## Verifying it runs — check the logs

A green test suite and a rendered screen aren't proof. Read what the platforms recorded.

**Locally**, before calling a change done: the browser console clean of errors and React warnings, the network tab showing the requests you expected (and no request storm from a subscription re-firing), and the Supabase logs for the other half of the story — `query_logs` on `postgrest` for reads RLS refused, on `auth` for token failures, on `realtime` for subscriptions that dropped. An empty ledger for a legitimate player is an RLS denial that the UI renders as "no entries"; the client will never tell you that, and the log says `42501`.

**When the web app is deployed to Vercel**, checking the logs is part of shipping, not a debugging step for when something breaks:

- `get_deployment_build_logs` on the new deployment — a build that failed, or succeeded while dropping an env var, shows up nowhere else.
- `get_runtime_errors` — unhandled exceptions from real sessions.
- `get_runtime_logs` — what actually happened during a request.

Check them after the deploy finishes and before telling anyone the change is live. A deployment that builds is not a deployment that works: a missing `VITE_` variable produces a bundle that compiles perfectly and then fails to reach the API at runtime, which is exactly the class of failure these logs catch and the build output doesn't.

There is no deployment yet, so this applies from the first one onward. Don't add Vercel configuration to make it applicable.

Never paste log output containing tokens, session identifiers or payout details anywhere. Quote the error, not the record.

## Working conventions

Build in this order when adding a feature: types, then the derived computation with its test, then the component. The computation is where correctness lives; if it's written after the UI it tends to get shaped by what's convenient to render.

Keep all money maths in `lib/money.ts` and all derivation in `lib/ledger.ts`. Components read those; they never do arithmetic on amounts inline.

New screens, auth changes, anything touching money display or settlement go on a branch with a PR — see `repo`.

Flag rather than guess. If a task implies an API field that doesn't exist yet, say so instead of inventing a shape the backend doesn't return.
