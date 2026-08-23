/**
 * All client-side derivation from entry lists lives here, computed fresh
 * from the entries every time (via useMemo at call sites) — never
 * incrementally, never in an effect, never stored in state.
 *
 * The API's figures are authoritative; these exist for rendering fallbacks
 * and for tests that pin the claims-vs-facts rules. Where both are on
 * screen, render the API's numbers.
 */

import type { Entry } from './types';

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
