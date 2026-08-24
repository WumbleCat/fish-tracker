---
name: mobile-design
description: Build the phone app for fish-tracker, the poker buy-in and cash-out ledger — React Native + Expo + TypeScript, one-handed logging at the table, guest join by code, live net positions, host verification queue, currency, settlement and payout details. Use this skill whenever work touches the mobile/phone UI in `mobile/`, including new screens, the entry sheet, the verify flow, notifications, offline behaviour, or any layout decision on a phone. Trigger it even when the request sounds small ("add a button", "make the keypad bigger", "show who's up") — the money-handling and verification rules apply to every change, and mobile is where entries are actually captured, so a bad flow here means entries go unlogged. For laptop UI use `desktop-design`; the two are deliberately different products.
---

# fish-tracker — mobile app

The phone client. Lives in `mobile/`. Its entire job is capturing entries in the three seconds someone can spare mid-hand, and letting the host verify them without leaving the table.

This skill covers the frontend only. It never talks to a database directly — it consumes the API described in `backend`. Domain rules are in `app-logic`; this renders them and never reimplements them. If a task needs schema or backend changes, say so and stop.

## Mobile is not a small desktop

`desktop-design` covers the laptop app. The split is a product decision, not a breakpoint:

| | Mobile (this skill) | Desktop (`desktop-design`) |
|---|---|---|
| Used | At the table, mid-hand, one-handed, badly lit | After the game, sitting down |
| For | Logging a buy-in in three seconds; verifying in one tap | Reviewing, correcting, analysing, settling |
| Layout | One column, thumb zone, big targets | Dense multi-column, twenty rows visible |
| Input | Numeric keypad, bottom sheets, haptics | Keyboard-first, inline editing |
| Success | Nobody has to remember to log it later | Nothing has to be re-checked |

Never port the desktop ledger table here. A twenty-row dense table on a phone is unreadable in a dim room, and the person holding it is also holding cards.

## The three rules that override everything

Identical to desktop, because they're properties of the ledger, not of the screen.

**1. Money is an integer number of minor units. Never a float.** Every amount crossing a component boundary is `amountMinor: number` plus its currency. Format only at render, with `dinero.js`. Never parse a currency string into a float — parse to minor units with integer arithmetic. Use the true minus sign `−` (U+2212).

**2. Balances are derived, never stored.** Render what the API returns. Never keep a `net` in Zustand or AsyncStorage that you update alongside an entry. A cached balance and its entries diverge, and they diverge at 2am while people are handing over cash.

**3. Reconciliation is surfaced before settlement, always.** When verified buy-ins don't equal verified cash-outs, the settle screen shows the discrepancy and requires acknowledgement before any payment is displayed. Never round it away, never render a settlement as if it balances when it doesn't.

## Stack

| Concern | Choice |
|---|---|
| Framework | React Native via Expo (managed), TypeScript strict |
| Routing | `expo-router` |
| Styling | NativeWind (Tailwind semantics) |
| Server state | TanStack Query |
| Realtime | `@supabase/supabase-js` subscription → query invalidation |
| Auth | `@supabase/supabase-js`; tokens in `expo-secure-store` |
| Client state | Zustand — UI state only, never derived money |
| Forms | `react-hook-form` + `zod` |
| Money | `dinero.js` v2 |
| Dates | `date-fns` |
| Sheets | `@gorhom/bottom-sheet` |
| Feedback | `expo-haptics` |
| Notifications | `expo-notifications` |

Tokens go in `expo-secure-store`, never `AsyncStorage`. A guest token is scoped to one game but is still a credential.

## The core interaction

Logging a buy-in is the only thing that has to be fast. Everything else can take a tap more.

- **A persistent primary action.** From the game screen, one thumb-reachable button opens the entry sheet. It is reachable without a scroll, at the bottom of the screen, on any phone size.
- **Amount first.** The sheet opens with a large numeric keypad already focused and the stake pre-filled as the default. Common amounts (the stake, 2×, last amount used) are one-tap chips above the keypad.
- **Two taps for the common case.** Open → confirm. A standard rebuy at the table stake should never need typing.
- **Confirm with haptics.** A success haptic on submit, and the entry appears immediately in a pending treatment. Optimistic display is fine for your own pending entry; optimistic *verification* never is.
- **Cash-out uses the same sheet**, different type, and requires the amount to be typed in full — no default, no one-tap chip. This is the number that decides what people get paid, and a pre-filled cash-out is an invitation to accept a wrong one.

Never place destructive or state-changing host actions (void, close game, remove player) in the thumb zone next to the entry button. The most-tapped area of the screen holds the safest action.

## Host verification on a phone

The host is playing too. Verification has to fit between hands.

- A **verify queue** as its own screen: one pending entry at a time, big, showing who / what / how much / how long ago. Verify and Reject as two large, clearly separated targets — never adjacent same-coloured buttons, and never a swipe where a mis-swipe verifies.
- **Reject asks for an optional note** in the same sheet, not a follow-up screen. Skippable with one tap.
- **A badge** on the queue showing the number of pending entries, and a push notification when something is logged — the host is not staring at the app. Notifications are the mechanism that keeps the ledger current; treat them as a core feature, not a nicety.
- **No bulk verify.** No "verify all", no swipe-through-everything gesture, no shortcut that resolves more than one entry per deliberate action. This is the rule most likely to be eroded by "make it faster on mobile" — don't.
- Cash-outs appear in the same queue as buy-ins, verified the same way.

## Auth and guest join

- **Join by code is the front door** — the "Deal me in" direction (decided 2026-08-24): "Sit down", six round chip tiles for the code (a hidden `TextInput` behind them; tap the row to focus), a pill name field, a mint pill "Deal me in", and "Host? Sign in" as the small line underneath. Big enough to use while someone reads six characters aloud across a room.
- **Join link**: `app/join/[code]` (scheme `mobile://join/CODE`, or the web link via app links) lands on the front door with the tiles filled; a signed-in player opening it is seated straight away. A QR remains a good next step so the host can show a phone rather than shout a code.
- A full table (nine seats, host included) is refused as "That table is full — nine seats, all taken." — a normal condition, not an error state.
- **Sign in / sign up** via Supabase Auth: email + password and magic link. Magic link is the better default on a phone.
- **Guest state is a quiet marker**, not a nag: a small "playing as guest" chip with one "save my history" action. Never interrupt logging with a sign-up prompt — a blocked entry is a hole in the ledger.
- **Guest limits show as absence.** No host controls, no payout fields, no lifetime tab. Don't render disabled controls with explanatory tooltips.
- Tokens refresh in the background. A guest whose token expires mid-game must be restored silently from secure storage, not bounced to a login screen at the table.

## Live nets

The game screen's main content is a per-player list: name, live net, and — separately — anything pending.

- Live net is the **verified** figure. A pending amount is shown beside it as a provisional chip ("+£40 pending"), never added into the net.
- Pending entries use a visibly distinct, muted treatment. On a phone, in a dim room, the difference between a claim and a fact must survive a glance.
- A player still in the game shows a negative net equal to their buy-ins. Don't blank it or dash it.
- Subscribe to the game's entries via Supabase Realtime and use the event to invalidate the query cache; render what the refetch returns. Never compute a net from a Realtime payload — that's settlement logic in disguise.
- Sort the list by net descending by default. People look at this to see who's up.

## Currency

- A currency control lives in **settings**, not in the game screen chrome — on a phone the header is too scarce, and it only sets the default for *new* games plus the display currency for lifetime history.
- Inside a game the currency is the game's and is not switchable once entries exist. Show it in the game header so nobody misreads a EUR ledger as sterling.
- Read the exponent from the game rather than assuming 2. A JPY game must not render `¥1000.00`.
- Lifetime history is grouped per currency, never summed across them. There is no FX in this product.

## Offline

Phones lose signal in kitchens and basements. The app must not lose an entry because of it.

- **Queue your own entry writes.** An entry logged offline is held locally, shown in a distinct "not sent" state (visibly different from "pending" — one means the server hasn't seen it, the other means the host hasn't), and flushed on reconnect. Entries are append-only, so replaying them is safe.
- **Never queue verifications, rejections, voids, state changes or close.** Those depend on server state that may have moved. Offline, those controls are disabled with a plain "you're offline" message.
- Use a client-generated idempotency key on queued entries so a flaky reconnect can't log the same buy-in twice.
- Reads are served from the query cache with a clear stale indicator. Never show a settlement computed from stale data — the settle screen requires a fresh fetch and says so if it can't get one.

## Screens

- **Landing** — join by code, or sign in.
- **Game** — live net list, chips-on-table and settleable totals, pending count, primary entry action.
- **Entry sheet** — buy-in / rebuy / cash-out, numeric keypad, amount chips.
- **Verify queue** — host only, one entry at a time.
- **My entries** — this player's own history in this game, with amend on rejected entries.
- **Settle** — reconciliation banner, who pays whom, payout details.
- **Sessions** — past games, per-currency lifetime net.
- **Settings** — display name, default currency, payout details, notifications.

## Payout details

- The **settle screen** is where they belong: the host's account block first — account name, sort code, account number — each field with its own copy button, plus copy-all. Copying is the whole point on a phone; someone is switching to their banking app.
- Each payment row shows the payee's details where provided, since not every payment goes to the host.
- **Non-GBP games** show the free-text payment reference instead of the UK bank fields.
- Details are entered in **settings** by the owner, registered users only.

Handling rules, not negotiable:

- Masked by default (`••••1234`), explicit reveal, copy without revealing.
- Never logged, never sent to analytics or crash reporting, never in a URL or deep link, never included in a shared settlement summary. The share sheet exports names and amounts, never bank details.
- Only render what the API returns for this game. No placeholders implying someone is missing something.

## Typeface (decided 2026-08-24)

The house face is **Aperçu Medium**. Every screen imports `Text` from `components/Text` (never from `react-native`), which applies `font-sans` → `Apercu-Medium` from `tailwind.config.js`; `lib/fonts.ts` loads whatever `lib/font-sources.ts` lists with `expo-font` and holds the splash until it's in. The licensed file is gitignored — drop it into `assets/fonts/` and uncomment the one `require` line (see the README there). Until then the platform default renders.

## Feel

- Tap targets 44pt minimum, and the primary entry action considerably larger.
- Amounts use tabular figures so a column of nets scans cleanly.
- Sign carried by `+`/`−` first, colour second — never colour alone.
- Never soften a loss: no rounding toward zero, no gentler colour for a downswing.
- Dark mode is the default worth designing for. This app is used at night.
- Haptics for confirmation and rejection; nothing that vibrates without a state change behind it.

## Empty and error states

- **Not in a game** — a code field, not an apology.
- **Game with no entries** — prompt to log the first buy-in, primary action already in reach.
- **Reconciliation mismatch** — never an error. Rendered as the same fixed counter block as desktop (BUY-INS / CASH-OUTS / GAP rows, short/over pill, no prose — decided 2026-08-24); a nonzero gap gates payments until acknowledged.
- **Version conflict (409)** — the entry changed under you. Refetch, show what it is now, ask again. Never retry silently.
- **Offline** — a persistent, unobtrusive banner; queued entries visible and counted.
- **Failed write** — keep the amount in the sheet and offer retry. Never discard a typed entry.

## Testing

Jest + React Native Testing Library, plus Maestro (or Detox) for the flows that matter at the table.

- Money formatting across zero, negative, large values and a zero-exponent currency.
- Pending amounts never merge into a net figure.
- Optimistic own-entry display, and that verification is never optimistic.
- Offline queue: entry logged offline appears as not-sent, flushes once on reconnect, and the idempotency key prevents a double-log.
- Verify and reject targets are far enough apart that a mis-tap can't verify — assert layout, not just handlers.
- Guest sessions render no host controls and no payout fields; a guest token from another game is rejected.
- Reconciliation mismatch blocks the payment list until acknowledged.

## Verifying it runs — check the logs

The phone hides its failures better than any other client: a dropped subscription looks like a quiet table, and a refused read looks like an empty game.

After exercising a flow on a device or simulator, read the **Supabase** logs rather than trusting the screen — `query_logs` on `auth` for token refreshes that failed (the guest whose session died mid-game), on `realtime` for subscriptions that dropped when the phone backgrounded or lost signal, on `postgrest` for reads RLS refused. A player seeing an empty ledger is almost always a `42501` in that last one, and the app has no way to tell you.

Also check the Expo/Metro console for unhandled promise rejections — a failed write that the offline queue swallowed is invisible in the UI by design, and this is where it surfaces.

The mobile app is not deployed to Vercel; it ships through Expo, so there are no Vercel logs for it. When the **API** it talks to is eventually deployed, its runtime logs are the other half of any mobile bug — see `backend`.

Never paste log output containing tokens, device identifiers or payout details anywhere. Quote the error, not the record.

## Working conventions

Build in this order: types, then the derived computation with its test, then the screen. Keep money maths in `lib/money.ts` and derivation in `lib/ledger.ts` — mirroring `web/`, but not shared through a package until there is a third consumer; a premature shared module tends to get bent to fit whichever client changed last.

New screens, auth changes, offline behaviour and anything touching money display or settlement go on a branch with a PR — see `repo`.

Flag rather than guess. If a task implies an API field that doesn't exist yet, say so instead of inventing a shape the backend doesn't return.
