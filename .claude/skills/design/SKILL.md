---
name: poker-ledger-web
description: Build the desktop web frontend for the poker buy-in and cash-out ledger — React + Vite + TypeScript, dense tables, keyboard-first entry, session and player views. Use this skill whenever work touches the web/laptop UI of the poker tracker, including new screens, the ledger table, settlement views, charts, forms for logging buy-ins or cash-outs, or any styling and layout decision in the web app. Trigger it even when the request sounds small ("add a column", "fix this modal", "show lifetime net") — the money-handling and reconciliation rules here apply to every change, and getting them wrong corrupts the ledger silently.
---

# Poker ledger — web frontend

The desktop client for tracking buy-ins, rebuys and cash-outs across poker sessions, and settling up who pays whom at the end.

This skill covers the frontend only. It never talks to a database directly — it consumes an API. If a task needs schema or backend changes, say so and stop rather than reaching past the boundary.

## The three rules that override everything

These are not style preferences. Breaking any of them produces a ledger people can't trust, which is the only thing the product sells.

**1. Money is an integer number of pence. Never a float.**

`0.1 + 0.2 !== 0.3`. A ledger that drifts by a penny per session is worse than no ledger, because it looks authoritative. Every amount crossing a component boundary is `amountPence: number`. Convert to a display string only at the moment of rendering, using `dinero.js`. Never parse a currency string back into a float — parse to pence with integer arithmetic.

```ts
import { dinero, toDecimal } from 'dinero.js';
import { GBP } from '@dinero.js/currencies';

export const money = (pence: number) => dinero({ amount: pence, currency: GBP });
export const fmt = (pence: number) =>
  `${pence < 0 ? '−' : ''}£${toDecimal(money(Math.abs(pence)))}`;
```

Use the true minus sign `−` (U+2212), not a hyphen. It aligns with digit width in tabular figures; a hyphen doesn't.

**2. Balances are derived, never stored in state.**

The API returns entries — buy-ins, rebuys, cash-outs, adjustments. Compute each player's net by summing them with `useMemo`. Never keep a `balance` field in Zustand or component state that you update alongside an entry. A cached balance and its underlying entries will diverge, and the divergence appears at 2am when people are handing over cash.

**3. Reconciliation is surfaced before settlement, always.**

Total buy-ins must equal total cash-outs. When they don't, chips are missing or miscounted. Render the discrepancy as a prominent banner above the settlement UI and require an explicit acknowledgement before payments are shown. Never silently round the difference away, and never let the settlement view render as if the numbers balance when they don't.

## Stack

| Concern | Choice |
|---|---|
| Build | Vite + React 18 + TypeScript (strict) |
| Routing | React Router (or TanStack Router) |
| Styling | Tailwind CSS |
| Component primitives | Radix UI |
| Icons | `lucide-react` |
| Server state | TanStack Query |
| Client state | Zustand — UI state only, never derived money |
| Tables | TanStack Table |
| Forms | `react-hook-form` + `zod` |
| Money | `dinero.js` v2 |
| Dates | `date-fns` |
| Charts | Recharts |

Radix over a full component library because the ledger table and settlement views are custom anyway; what's actually needed is accessible dialog, popover, dropdown and tooltip primitives, not someone else's opinion about card padding.

## What desktop is for

The mobile app exists to capture entries fast during a game. The web app exists to review, correct and analyse afterwards. Design for that, not for a stretched phone layout.

Concretely, desktop should lean into:

- **Density.** Show twenty ledger rows at once. Whitespace that feels generous on a phone wastes a laptop screen and forces scrolling through data users are trying to compare.
- **Keyboard entry.** Someone reconciling a session enters many amounts in sequence. Every entry form is fully keyboard-operable: `Tab` moves through fields, `Enter` submits and immediately focuses the next row's first input, `Esc` cancels. If a task requires reaching for the mouse between entries, the design has failed.
- **Multi-column layout.** Session detail sits beside the running settlement, so the effect of an edit is visible without navigation.
- **Hover affordances.** Row actions (edit, void) appear on hover rather than occupying permanent space.
- **Inline editing.** Correcting a mistyped buy-in happens in the table cell, not in a modal.

Do not use bottom sheets, swipe gestures, or thumb-zone layouts here. Those are mobile idioms and they read as broken on a laptop.

## Keyboard shortcuts

Implement these globally; they are the main reason someone opens the web app rather than the phone.

| Key | Action |
|---|---|
| `n` | New entry in current session |
| `r` | Rebuy for selected player |
| `c` | Cash out selected player |
| `/` | Focus search |
| `↑` `↓` | Move row selection |
| `Enter` | Edit selected row |
| `Esc` | Cancel edit / close dialog |
| `?` | Shortcut reference |

Suppress all of these while a text input has focus, or typing "n" in a player name opens a dialog.

## Numeric display

Every figure that appears in a column uses tabular numerals: `font-variant-numeric: tabular-nums`, or Tailwind's `tabular-nums`. Digits then align vertically, which makes an anomalous total visible at a glance. Proportional numerals hide exactly the errors this app exists to catch.

Sign is carried by the `+`/`−` character first and colour second. Green-for-up and red-for-down is conventional and worth keeping, but it must never be the only signal — that pair is precisely what collapses for red-green colourblind users.

Never soften a loss. Rounding a downswing toward zero, or styling it in a gentler colour than a win, makes the ledger flattering and therefore useless.

## Screens

- **Sessions list** — date, stake, player count, total pot, reconciliation status. Sortable, filterable by date range and player.
- **Session detail** — the primary screen. Ledger table (player, buy-ins, rebuys, cash-out, net), running reconciliation figure, settlement panel alongside.
- **Player profile** — lifetime net, sessions played, best and worst results, average buy-in, rebuy rate, outstanding balance, cumulative net line chart.
- **Settlement** — the ordered list of who pays whom, with a copy-to-clipboard summary for pasting into a group chat.

## Settlement rendering

The API returns payments. The frontend renders them and does not recompute them — two implementations of the settlement algorithm will disagree eventually, and the one users see should not be the second-best copy.

Render as a simple ordered list, `payer → payee → amount`. Resist the urge to draw a network graph; people want to read who to hand notes to, not admire a visualisation.

## Empty and error states

- **No sessions yet** — invitation to create one, not an apology.
- **Session with no entries** — prompt to add players, with the shortcut hint visible.
- **Reconciliation mismatch** — never an error state. It's a normal, expected condition that needs surfacing and resolving, so it reads as a warning with a clear next action ("recount chips" / "log the missing rebuy").
- **API failure** — say what failed and offer retry. Never discard unsaved entry data on a failed write; keep it in the form and let the user retry.

## Testing

Vitest plus React Testing Library. Prioritise these, because they're where a silent corruption would live:

- Money formatting across zero, negative, and large values.
- Net computation from an entry list, including voided entries.
- Reconciliation detection — a session that doesn't balance must be flagged.
- Keyboard flow: entering three consecutive buy-ins without the mouse.

## Working conventions

Build in this order when adding a feature: types, then the derived computation with its test, then the component. The computation is where correctness lives; if it's written after the UI it tends to get shaped by what's convenient to render.

Keep all money maths in `lib/money.ts` and all derivation in `lib/ledger.ts`. Components read those; they never do arithmetic on amounts inline.

Flag rather than guess. If a task implies an API field that doesn't exist yet, say so instead of inventing a shape the backend doesn't return.
