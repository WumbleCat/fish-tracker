---
name: app-logic
description: The domain rules for fish-tracker, the poker home-game ledger — accounts and guest players, game and entry lifecycles, host verification of self-reported buy-ins and cash-outs, live net positions, currency, settlement gating, reconciliation, host payout details, and the audit trail. Use this skill for any work touching game state, buy-in or cash-out records, verification and rejection flows, joining or leaving a game, settlement calculation, or permissions. Trigger it even for small-sounding changes ("let players edit a buy-in", "auto-verify small amounts", "add a delete button") — these rules define what the ledger means, and a change that looks like a UI convenience can quietly make the numbers untrustworthy.
---

# fish-tracker — game logic

The domain layer for **fish-tracker**, a ledger for real home poker games. Frontend skills (`design` for desktop web, `mobile` for phones) render what this defines; they never reimplement it. `backend` turns it into schema and endpoints. `repo` covers layout, git flow and environments.

This is built for an actual weekly game, not a portfolio piece. Where a rule here trades convenience for correctness, correctness won on purpose.

## The shape of the thing

A user creates an account, creates a home game, and becomes its host. Other people join with a short code — either signed in, or as a **guest** with just a display name. Each player logs their own buy-ins. The host verifies each one individually. Cash-outs are logged the same way and verified the same way.

That verification step is the whole design. Because players self-report, the ledger holds two different kinds of thing: **claims** (what a player says they put in or took off) and **facts** (what the host has confirmed). Conflating them is the failure mode this entire skill exists to prevent.

## Trust model — read this before designing any check

This is friends playing cards in someone's kitchen. Verification exists to catch **honest mistakes**: a mistyped £200, a buy-in logged twice, someone forgetting they rebought, a stack counted wrong at 2am. It is not a fraud-prevention system, and building it as one produces an app nobody enjoys using.

Practical consequences:

- Never phrase a rejection as an accusation. "Amount doesn't match" is right; "unverified claim" is not.
- Never surface a player's rejection rate, or anything else that scores their honesty.
- Don't add approval steps beyond the single host check. Every extra gate is friction during a live game, and friction means entries stop being logged — which corrupts the ledger far more reliably than a mistyped amount would.
- Do make correcting a mistake trivially easy. Most rejections are the player getting it wrong and wanting to fix it.

## Identity: accounts and guests

Two kinds of player, one ledger.

| | Registered user | Guest |
|---|---|---|
| Created by | Sign-up (email + password, or magic link) via Supabase Auth | Entering a display name against a join code |
| Persists across games | Yes | No — scoped to the one game |
| Lifetime history | Yes | No |
| Can host | Yes | Never |
| Can verify | Only if host | Never |
| Can log own entries | Yes | Yes |
| Can store payout details | Yes | No |

Guests exist because the person who turns up once and pays cash should not have to make an account at the table. Requiring sign-up mid-game means someone doesn't get logged, and an unlogged player is a hole in the ledger.

A guest is a real row in the ledger with a real position; the only thing they lack is an identity that outlives the game. A guest may **claim** their record later by signing up and following the game's claim link — this merges the guest row into the new account and backfills their history. Merging is one-directional and irreversible: never let a claim reassign entries to a different person than the one who logged them.

Guests never get host powers, including via host transfer. A game whose host has left and whose remaining players are all guests cannot be closed by the app — flag that rather than inventing a guest-promotion path.

## Roles

| Role | Can do |
|---|---|
| Guest player | Join a game, log own buy-ins and cash-out, view full ledger and live nets |
| Player | All of the above, plus: view own lifetime history, hold payout details, be made host |
| Host | Everything a player can, plus: verify/reject/void any entry, admit or remove players, set the game currency at creation, change game state, close the game, transfer host |

Every player sees the whole ledger, including live net positions. Hiding other people's numbers would be pointless — everyone is sitting at the same table watching the chips — and transparency is what makes the verification step meaningful.

The host is also a player and logs their own buy-ins. Self-verification is permitted, because requiring a second person creates a deadlock when the host is the only one paying attention. But host self-verifications are marked as such in the audit trail, so a discrepancy can be traced.

## Game lifecycle

```
draft ──► open ──► running ──► settling ──► closed
                      │
                      └──► abandoned
```

| State | Meaning | Allowed |
|---|---|---|
| `draft` | Created, not yet accepting players | Host edits settings, including currency |
| `open` | Accepting joins, no chips yet | Join, leave, edit settings, change currency |
| `running` | Game in play | Join, log buy-ins and cash-outs, verify |
| `settling` | Play stopped, resolving the ledger | Verify, amend, cash out. No new buy-ins |
| `closed` | Settled and final | Read only |
| `abandoned` | Ended without settling | Read only, flagged |

Transitions are host-only and one-directional, except `settling → running`, which exists because "one more orbit" always happens. Never allow `closed → anything`; corrections after close go into a new adjustment record referencing the closed game, so the closed ledger stays intact.

A game cannot enter `closed` while any entry is `pending`. Force the host to resolve every claim first. This is the single most important gate in the system.

## Currency

Every game has exactly one currency, chosen by the host at creation. **GBP is the default.**

- Currency is set at `draft`/`open` and becomes **immutable the moment the game holds any entry**. Changing the currency of a ledger that already holds amounts would silently reinterpret every number in it.
- The currency switcher in the clients (see `design` and `mobile`) sets the user's default for *new* games and the display currency for their own lifetime history. It never converts or re-denominates an existing game.
- There is **no FX conversion anywhere**. A player's lifetime history across a GBP game and a EUR game shows two separate totals, not a combined one. Summing across currencies is a bug, not a feature — if a task asks for a single combined lifetime number, raise it rather than picking a rate.
- Amounts are stored as integer **minor units** against the currency's exponent (GBP → pence, exponent 2). See `backend` for the column contract. A currency with a different exponent (JPY, exponent 0) must not be special-cased in client code — read the exponent from the game.

## Entry lifecycle

Every buy-in, rebuy and cash-out is an entry.

```
pending ──► verified ──► (void)
   │
   └──► rejected ──► (amended → new pending entry)
```

- **`pending`** — logged by a player, awaiting host action. The default on creation, for every entry type.
- **`verified`** — host confirmed. Counts toward settlement.
- **`rejected`** — host says the amount is wrong. Does not count toward settlement. Stays visible.
- **`void`** — a verified entry later found to be wrong. Requires a reason. Stays visible, struck through.

**Nothing is ever deleted.** Rejection and voiding are state changes, not removals. A player who logs £20 twice by accident should see both records, one rejected, so they understand what happened. Deleting rows destroys the audit trail that makes the ledger believable, and "where did my buy-in go?" is a much worse conversation than "that one got rejected".

**Rejection does not mean the money doesn't exist.** It means the recorded amount is wrong. The correct flow after rejection is *amend*: the player logs a corrected entry, which links to the rejected one via `amends_entry_id` and starts as `pending`. Never mutate the rejected entry's amount — create a new record.

An optional rejection note from the host ("you put in £20, not £40") massively reduces back-and-forth. Make it easy to attach, never mandatory.

## Verification rules

**Cash-outs are verified exactly like buy-ins.** A cash-out is logged by the player, starts `pending`, and requires host confirmation before it counts. This is not symmetry for its own sake: the cash-out is where money leaves the table, it is the number nobody can re-check once the chips are back in the tray, and it is the single figure that most often makes a game fail to reconcile. An unverified cash-out is the most expensive unverified thing in the system.

Everything else applies to both types:

- Each entry is verified individually. Never offer bulk "verify all" — it defeats the purpose, and the host will use it reflexively at the moment attention matters most.
- A verified entry can be voided by the host, but not un-verified. Reversal is an explicit, recorded act rather than an undo.
- A rejected entry can be re-verified by the host if the rejection was itself a mistake. This is common enough to support directly.
- A rejected cash-out can be amended by its owner, exactly as a buy-in can.
- Timestamps are recorded for both the logging and the verification, by different actors. The gap between them is often the most useful diagnostic when a game doesn't reconcile.
- Never auto-verify. Not below a threshold, not for the host, not after a timeout. An auto-verified entry is indistinguishable in the data from a checked one, which makes every verified entry mean less.

A player may hold at most **one pending cash-out** at a time, and may log a new cash-out only when every verified cash-out they already hold predates a later verified buy-in or rebuy. Two live cash-outs against the same sitting would silently double their settleable position. A player who cashes out and then rebuys is normal — the rebuy is a new buy-in, their verified cash-out stands, and the rebuy opens a fresh cash-out slot (decided 2026-08-23; the UI reads the night as one session with multiple sit-downs, not two sessions).

## The two totals

This is the subtlety that most implementations get wrong.

**Chips on the table** = verified + pending buy-ins, minus verified + pending cash-outs. Pending entries are included because the chips are physically in front of the player regardless of whether the host has tapped a button. This is the number to reconcile against a physical chip count.

**Settleable position** = verified entries only. This is what determines who pays whom.

Show both while a game is running. When they differ, the difference is exactly the value of outstanding claims, and naming it that way ("£40 awaiting verification") tells the host precisely what to do next.

At close, the two must be equal, because no pending entries may remain.

## Live net positions

A running game shows each player's **live net**, visible to everyone at the table.

- Live net is the **settleable** figure: verified cash-outs minus verified buy-ins. It is the only number the app will ever be held to.
- Alongside it, show that player's pending delta as a separate, visibly provisional figure ("+£40 awaiting verification"). Never fold pending amounts into the net itself — a net that jumps when the host taps verify, with no money having moved, is exactly the confusion this whole model exists to prevent.
- A player still in the game has no verified cash-out, so their live net reads as their total buy-ins, in the red. That is correct and must not be softened, hidden, or replaced with a dash. Someone £300 down after four rebuys should see £300 down.
- Live nets update for everyone in near-real-time. Clients subscribe rather than poll (see `backend` on Realtime); a stale net at the table is worse than a spinner.

This was a deliberate product decision: live nets can influence how people play, and that was accepted in exchange for anyone being able to check the ledger against reality at any point in the night.

## Reconciliation

Total verified buy-ins must equal total verified cash-outs when a game closes. When they don't, chips are miscounted or someone left with a stack.

Surface the discrepancy above the settlement UI and require explicit acknowledgement before payments render. Never round the difference away, and never let settlement display as if it balances when it doesn't.

If the host acknowledges a discrepancy and closes anyway, record the acknowledgement with the amount and the acknowledging user. An unexplained gap in a closed game must always be traceable to someone's decision.

## Settlement

Compute from verified entries only. Net per player is verified cash-outs minus verified buy-ins; the sum of all nets must be zero, and if it isn't, that's a bug in the derivation, not a rounding issue to paper over.

Payments are generated by greedy largest-debtor-to-largest-creditor matching. It doesn't guarantee the minimum number of transfers (that problem is NP-hard) but it runs instantly and typically produces three or four payments for eight players instead of everyone paying everyone.

Settlement is computed server-side and rendered by clients. Two implementations will diverge eventually, and the one users see should not be the second-best copy.

## Payout details

Settling up means someone typing a sort code into their banking app at 1am. The ledger should make that a copy-paste, not a shouted conversation.

- Any registered user may store **payout details**: account name, sort code and account number (UK), a **Revolut link** (revolut.me/…, added 2026-08-24 as a first-class field — it renders whatever the game's currency, since Revolut spans currencies), or a free-text payment reference for other currencies (IBAN, a payment-link, whatever the group uses). Entirely optional — a user who never enters them loses convenience, nothing else.
- Guests cannot store payout details; nothing outlives their game to hold them.
- The **host's** details are surfaced most prominently, because home games are usually settled through the host as banker. Exact placement is each client's call (`design` puts them in the settlement panel with a compact reference in the game header; `mobile` on the settle screen), but they must be reachable from wherever a payment is shown.
- On an individual payment row, show the **payee's** details when that payee has provided any. The payer is the person who needs them.

Rules that are not negotiable:

- Payout details are visible only to players in a game they are settling with that person. Never public, never on a profile a stranger can reach, never returned by an endpoint that isn't scoped to a shared game.
- Never write them to logs, error reports or analytics, and never embed them in the persisted settlement snapshot. The snapshot records who owes whom; details are looked up live, so a user who changes or removes them isn't leaking an old account number out of history.
- Mask the account number by default (`••••1234`) behind an explicit reveal or copy action. Copy is the action people actually use.
- Validate format on entry (UK sort code: 6 digits; account number: 8 digits; Revolut link: revolut.me/handle) but treat it as a typo-catcher, not verification. The app never confirms an account exists, and must never imply it has. A Revolut link, unlike an account number, is a public handle and is shown unmasked — the visibility scoping (shared game only) still applies.

## Joining

Joining uses a short human-readable code or a link — people are in a room together, so anything requiring account lookup is worse than reading six characters aloud. Guests use the same code and add only a display name.

A player joining mid-game is normal, not an edge case. They join at `running`, and their first buy-in behaves like any other.

**A table seats at most nine** (decided 2026-08-24) — the host included, since the host plays. A join that would make a tenth active member is refused with `table_full`; it is a normal condition, phrased as "that table is full", never a fault. A player who has left (`departed_at` set) no longer occupies a seat, so a seat frees when someone leaves and is taken again if they rejoin. The count is of people at the table, not of entries — a departed-unsettled player still holds no seat, though their unresolved entries still block close.

**A join link** carries the code: `/join/<CODE>` on the web pre-fills the code so a guest only types a name, and signs a registered user straight in to the game; the phone app accepts the same code through its own link. The link is the code in another form — it grants nothing the code doesn't, and expires with the game's joinable states exactly as the code does.

A player may leave a game only when their position is settled: all entries resolved, cash-out verified. A player with pending entries who leaves stays on the roster as `departed_unsettled` and blocks close until resolved.

Host transfer must exist. Hosts go to the shop, or bust out and lose interest, and a game that can't be closed because one person left is a real failure. Any current **registered** player can be made host by the current host. Guests are never eligible. A majority-claim path for when the host is absent was considered and **deferred** (decided 2026-08-23) — v1 ships host-initiated transfer only; if an absent host strands a game, that is raised as product feedback rather than solved with an invented mechanism.

## Concurrency

Two players logging simultaneously is routine. Entries are append-only, so they don't conflict.

Verification can conflict: if a host verifies while the player amends the same entry, resolve by rejecting the stale write and refetching. Use a version or updated-at token on the entry.

Never let a client's cached state decide whether an entry is verified. Verification status comes from the server on every read that precedes a settlement.

## Permissions checklist

Enforce on the server. Client-side checks are a UX affordance, not a control.

- Log buy-in: any player including guests, own record only, game `running`
- Log cash-out: any player including guests, own record only, game `running` or `settling`, and only if they have no live cash-out
- Verify / reject: host only, game `running` or `settling`
- Void: host only, verified entries only, reason required
- Amend: the entry's owner, rejected entries only
- Admit / remove player: host only
- Set or change currency: host only, and only while the game holds zero entries
- Edit own payout details: the owning registered user only
- Read another player's payout details: only players in a shared unsettled or recently closed game
- Change game state: host only
- Transfer host: current host, to a registered player only
- Close: host only, and only with zero pending entries

## Out of scope

**Tournaments are not in scope.** No prize pools, no finishing positions, no ICM. This is a cash-game ledger. If a task implies tournament structure, say so and stop rather than bolting a second money model onto entries — that needs its own deliberate schema, not one inherited by accident.

Also out of scope until explicitly asked for: FX conversion, cross-currency lifetime totals, chip-denomination tracking, per-hand history, staking or backing arrangements.

## Formerly open questions — decided 2026-08-23

These were open; the host decided them. They are rules now, not suggestions:

- **Abandoned games and guests.** A guest's row and entries in an abandoned game persist forever (nothing is deleted), and the claim link keeps working indefinitely — there is no settlement to protect, so there is no reason to expire the claim.
- **Adjustments after close.** An adjustment is a separate record beside the closed game's settlement; the original settlement is never altered. Adjustments appear in lifetime history as their own line. v1 carries the schema and a read-only rendering only — no adjustment-creation UI yet.
- **Cash-out then rebuy.** Yes — a rebuy after a verified cash-out opens a fresh cash-out slot (see Verification rules). The UI reads it as one session with multiple sit-downs.
- **Payout-details visibility after close.** Co-players of a closed game can see each other's payout details until **7 days** after `closed_at`; after that, only the owner. Unclosed (including abandoned) games don't start the clock.
