/**
 * All client-side derivation from entry lists lives here, computed fresh
 * from the entries every time (via useMemo at call sites) — never
 * incrementally, never in an effect, never stored in state.
 *
 * The API's figures are authoritative; these exist for rendering fallbacks
 * and for tests that pin the claims-vs-facts rules. Where both are on
 * screen, render the API's numbers.
 */

import type { Entry, PlayerNet } from './types';

export interface PlayerPosition {
  /** Verified entries only — the live net, the only number the app is held to. */
  settleableMinor: number;
  /** Pending entries only. NEVER merged into the net; rendered beside it. */
  pendingDeltaMinor: number;
  pendingCount: number;
}

export interface LedgerTotals {
  verifiedBuyInsMinor: number;
  verifiedCashOutsMinor: number;
  /** Verified + pending: the chips physically on the table. */
  chipsOnTableMinor: number;
  pendingCount: number;
}

const isBuyLike = (e: Entry) => e.entry_type === 'buy_in' || e.entry_type === 'rebuy';

export function computePositions(entries: Entry[]): Map<string, PlayerPosition> {
  const positions = new Map<string, PlayerPosition>();
  const at = (userId: string): PlayerPosition => {
    let p = positions.get(userId);
    if (!p) {
      p = { settleableMinor: 0, pendingDeltaMinor: 0, pendingCount: 0 };
      positions.set(userId, p);
    }
    return p;
  };

  for (const e of entries) {
    const signed = e.entry_type === 'cash_out' ? e.amount_minor : -e.amount_minor;
    if (e.state === 'verified') {
      at(e.user_id).settleableMinor += signed;
    } else if (e.state === 'pending') {
      const p = at(e.user_id);
      p.pendingDeltaMinor += signed;
      p.pendingCount += 1;
    }
    // rejected and void entries count toward nothing
  }
  return positions;
}

export function computeTotals(entries: Entry[]): LedgerTotals {
  const totals: LedgerTotals = {
    verifiedBuyInsMinor: 0,
    verifiedCashOutsMinor: 0,
    chipsOnTableMinor: 0,
    pendingCount: 0,
  };
  for (const e of entries) {
    if (e.state === 'verified') {
      if (isBuyLike(e)) {
        totals.verifiedBuyInsMinor += e.amount_minor;
        totals.chipsOnTableMinor += e.amount_minor;
      } else {
        totals.verifiedCashOutsMinor += e.amount_minor;
        totals.chipsOnTableMinor -= e.amount_minor;
      }
    } else if (e.state === 'pending') {
      totals.pendingCount += 1;
      totals.chipsOnTableMinor += isBuyLike(e) ? e.amount_minor : -e.amount_minor;
    }
  }
  return totals;
}

/** Verified buy-ins minus verified cash-outs. Non-zero means chips are
 * missing or miscounted — surfaced, never rounded away. */
export function reconciliationDiscrepancy(entries: Entry[]): number {
  const t = computeTotals(entries);
  return t.verifiedBuyInsMinor - t.verifiedCashOutsMinor;
}

export function isReconciled(entries: Entry[]): boolean {
  return reconciliationDiscrepancy(entries) === 0;
}

export function pendingEntries(entries: Entry[]): Entry[] {
  return entries
    .filter((e) => e.state === 'pending')
    .sort((a, b) => a.created_at.localeCompare(b.created_at)); // oldest first
}

/** Whether a player still has chips in front of them: they have verified
 * entries and the last one isn't a cash-out. Mirrors the server's own
 * "settled position" test, which is what decides whether leaving a table
 * counts as leaving unsettled. */
export function playersInPlay(entries: Entry[]): Set<string> {
  const lastVerified = new Map<string, Entry>();
  for (const e of entries) {
    if (e.state !== 'verified') continue; // rejected, pending and void hold no chips
    const held = lastVerified.get(e.user_id);
    if (!held || held.created_at.localeCompare(e.created_at) < 0) {
      lastVerified.set(e.user_id, e);
    }
  }
  const inPlay = new Set<string>();
  for (const [userId, e] of lastVerified) {
    if (e.entry_type !== 'cash_out') inPlay.add(userId);
  }
  return inPlay;
}

export type TableTotalStatus = 'in-play' | 'balanced' | 'gap';

export interface TableTotal {
  /** Every player's live net, added up. Verified only, like the nets it sums. */
  totalNetMinor: number;
  /** Every pending delta added up. Beside the total, never folded into it. */
  totalPendingMinor: number;
  status: TableTotalStatus;
  /** Why an in-play total isn't zero yet. */
  playersInPlayCount: number;
}

/**
 * The figure at the foot of the ledger, and what it means.
 *
 * The sum of the live nets is the reconciliation identity with its sign
 * flipped: verified cash-outs minus verified buy-ins. Which makes it three
 * different statements depending on where the night is:
 *
 * - while anyone still holds chips it is the value of those chips, and a big
 *   negative number there is the table working correctly, not a discrepancy;
 * - once everybody has a verified cash-out it must be zero;
 * - if it isn't, that is exactly the gap the settlement panel will gate on,
 *   named here in the same words rather than discovered at close.
 *
 * In-play is checked before zero on purpose: a total that happens to land on
 * zero while chips are still out has not balanced, it has coincided.
 */
export function tableTotal(nets: PlayerNet[], entries: Entry[]): TableTotal {
  const inPlay = playersInPlay(entries);
  const totalNetMinor = nets.reduce((sum, n) => sum + n.settleable_minor, 0);
  const totalPendingMinor = nets.reduce((sum, n) => sum + n.pending_delta_minor, 0);
  return {
    totalNetMinor,
    totalPendingMinor,
    status: inPlay.size > 0 ? 'in-play' : totalNetMinor === 0 ? 'balanced' : 'gap',
    playersInPlayCount: inPlay.size,
  };
}
