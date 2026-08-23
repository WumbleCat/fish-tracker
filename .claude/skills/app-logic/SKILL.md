---
name: poker-ledger-game-logic
description: The domain rules for the poker home-game ledger — game and entry lifecycles, host verification of self-reported buy-ins, settlement gating, reconciliation, and the audit trail. Use this skill for any work touching game state, buy-in or cash-out records, verification and rejection flows, joining or leaving a game, settlement calculation, or permissions. Trigger it even for small-sounding changes ("let players edit a buy-in", "auto-verify small amounts", "add a delete button") — these rules define what the ledger means, and a change that looks like a UI convenience can quietly make the numbers untrustworthy.
---

# Poker ledger — game logic

The domain layer. Frontend skills (`poker-ledger-web`, `poker-ledger-mobile`) render what this defines; they never reimplement it.

## The shape of the thing

Any player can create a home game and becomes its host. Other players join an active game. Each player logs their own buy-ins. The host verifies each one individually.

That last point is the whole design. Because players self-report, the ledger holds two different kinds of thing: **claims** (what a player says they put in) and **facts** (what the host has confirmed). Conflating them is the failure mode this entire skill exists to prevent.

## Trust model — read this before designing any check

This is friends playing cards in someone's kitchen. Verification exists to catch **honest mistakes**: a mistyped £200, a buy-in logged twice, someone forgetting they rebought. It is not a fraud-prevention system, and building it as one produces an app nobody enjoys using.

Practical consequences:

- Never phrase a rejection as an accusation. "Amount doesn't match" is right; "unverified claim" is not.
- Never surface a player's rejection rate, or anything else that scores their honesty.
- Don't add approval steps beyond the single host check. Every extra gate is friction during a live game, and friction means entries stop being logged — which corrupts the ledger far more reliably than a mistyped amount would.
- Do make correcting a mistake trivially easy. Most rejections are the player getting it wrong and wanting to fix it.

## Roles

| Role | Can do |
|---|---|
| Player | Join a game, log own buy-ins, request own cash-out, view full ledger, view own history |
| Host | Everything a player can, plus: verify/reject any entry, admit or remove players, close the game, transfer host |

Every player sees the whole ledger. Hiding other people's numbers would be pointless — everyone is sitting at the same table watching the chips — and transparency is what makes the verification step meaningful.

The host is also a player and logs their own buy-ins. Self-verification is permitted, because requiring a second person creates a deadlock when the host is the only one paying attention. But host self-verifications are marked as such in the audit trail, so a discrepancy can be traced.

## Game lifecycle

```
draft ──► open ──► running ──► settling ──► closed
                      │
                      └──► abandoned
```

| State | Meaning | Allowed |
|---|---|---|
| `draft` | Created, not yet accepting players | Host edits settings |
| `open` | Accepting joins, no chips yet | Join, leave, edit settings |
| `running` | Game in play | Join, log buy-ins, verify, cash out |
| `settling` | Play stopped, resolving the ledger | Verify, correct, cash out. No new buy-ins |
| `closed` | Settled and final | Read only |
| `abandoned` | Ended without settling | Read only, flagged |

Transitions are host-only and one-directional, except `settling → running`, which exists because "one more orbit" always happens. Never allow `closed → anything`; corrections after close go into a new adjustment record referencing the closed game, so the closed ledger stays intact.

A game cannot enter `closed` while any entry is `pending`. Force the host to resolve every claim first. This is the single most important gate in the system.

## Entry lifecycle

Every buy-in, rebuy and cash-out is an entry.

```
pending ──► verified ──► (void)
   │
   └──► rejected ──► (amended → new pending entry)
```

- **`pending`** — logged by a player, awaiting host action. The default on creation.
- **`verified`** — host confirmed. Counts toward settlement.
- **`rejected`** — host says the amount is wrong. Does not count toward settlement. Stays visible.
- **`void`** — a verified entry later found to be wrong. Requires a reason. Stays visible, struck through.

**Nothing is ever deleted.** Rejection and voiding are state changes, not removals. A player who logs £20 twice by accident should see both records, one rejected, so they understand what happened. Deleting rows destroys the audit trail that makes the ledger believable, and "where did my buy-in go?" is a much worse conversation than "that one got rejected".

**Rejection does not mean the money doesn't exist.** It means the recorded amount is wrong. The correct flow after rejection is *amend*: the player logs a corrected entry, which links to the rejected one via `amends_entry_id` and starts as `pending`. Never mutate the rejected entry's amount — create a new record.

An optional rejection note from the host ("you put in £20, not £40") massively reduces back-and-forth. Make it easy to attach, never mandatory.

## Verification rules

- Each entry is verified individually. Never offer bulk "verify all" — it defeats the purpose, and the host will use it reflexively at the moment attention matters most.
- A verified entry can be voided by the host, but not un-verified. Reversal is an explicit, recorded act rather than an undo.
- A rejected entry can be re-verified by the host if the rejection was itself a mistake. This is common enough to support directly.
- Timestamps are recorded for both the logging and the verification, by different actors. The gap between them is often the most useful diagnostic when a game doesn't reconcile.
- Never auto-verify. Not below a threshold, not for the host, not after a timeout. An auto-verified entry is indistinguishable in the data from a checked one, which makes every verified entry mean less.

## The two totals

This is the subtlety that most implementations get wrong.

**Chips on the table** = verified + pending buy-ins, minus cash-outs. Pending entries are included because the chips are physically in front of the player regardless of whether the host has tapped a button. This is the number to reconcile against a physical chip count.

**Settleable position** = verified entries only. This is what determines who pays whom.

Show both while a game is running. When they differ, the difference is exactly the value of outstanding claims, and naming it that way ("£40 awaiting verification") tells the host precisely what to do next.

At close, the two must be equal, because no pending entries may remain.

## Reconciliation

Total buy-ins must equal total cash-outs when a game closes. When they don't, chips are miscounted or someone left with a stack.

Surface the discrepancy above the settlement UI and require explicit acknowledgement before payments render. Never round the difference away, and never let settlement display as if it balances when it doesn't.

If the host acknowledges a discrepancy and closes anyway, record the acknowledgement with the amount and the acknowledging user. An unexplained gap in a closed game must always be traceable to someone's decision.

## Settlement

Compute from verified entries only. Net per player is verified cash-outs minus verified buy-ins; the sum of all nets must be zero, and if it isn't, that's a bug in the derivation, not a rounding issue to paper over.

Payments are generated by greedy largest-debtor-to-largest-creditor matching. It doesn't guarantee the minimum number of transfers (that problem is NP-hard) but it runs instantly and typically produces three or four payments for eight players instead of everyone paying everyone.

Settlement is computed server-side and rendered by clients. Two implementations will diverge eventually, and the one users see should not be the second-best copy.

## Joining

Joining uses a short human-readable code or a link — people are in a room together, so anything requiring account lookup is worse than reading six characters aloud.

A player joining mid-game is normal, not an edge case. They join at `running`, and their first buy-in behaves like any other.

A player may leave a game only when their position is settled: all entries resolved, cash-out verified. A player with pending entries who leaves stays on the roster as `departed_unsettled` and blocks close until resolved.

Host transfer must exist. Hosts go to the shop, or bust out and lose interest, and a game that can't be closed because one person left is a real failure. Any current player can be made host by the current host; if the host is absent, a majority of active players can claim it.

## Concurrency

Two players logging simultaneously is routine. Entries are append-only, so they don't conflict.

Verification can conflict: if a host verifies while the player amends the same entry, resolve by rejecting the stale write and refetching. Use a version or updated-at token on the entry.

Never let a client's cached state decide whether an entry is verified. Verification status comes from the server on every read that precedes a settlement.

## Permissions checklist

Enforce on the server. Client-side checks are a UX affordance, not a control.

- Log buy-in: any player, own record only, game `running`
- Verify / reject: host only, game `running` or `settling`
- Void: host only, verified entries only, reason required
- Amend: the entry's owner, rejected entries only
- Admit / remove player: host only
- Change game state: host only
- Close: host only, and only with zero pending entries

## Open questions to raise rather than assume

If a task touches any of these and the answer isn't already decided, ask instead of inventing:

- Do cash-outs need the same verification as buy-ins? (They arguably need it more — that's where money leaves the table.)
- Are tournaments in scope? They need prize pools and finishing positions rather than cash-outs, and bolting that onto a cash-game ledger later is awkward.
- Should a running game show live net positions, or only totals in? Live nets can affect how people play.
