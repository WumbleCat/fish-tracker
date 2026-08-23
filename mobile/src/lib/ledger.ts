/**
 * Client-side derivation from entry lists — computed fresh every time,
 * never stored, never updated incrementally. The API's figures are
 * authoritative; these exist for rendering fallbacks and for the tests
 * that pin the claims-vs-facts rules.
 */

import type { Entry, PlayerNet } from './types';

export interface PlayerPosition {
  settleableMinor: number;
  /** NEVER merged into the net; rendered beside it as a pending chip. */
  pendingDeltaMinor: number;
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
    const p = at(e.user_id); // every player with entries gets a position row
    const signed = e.entry_type === 'cash_out' ? e.amount_minor : -e.amount_minor;
    if (e.state === 'verified') {
      p.settleableMinor += signed;
    } else if (e.state === 'pending') {
      p.pendingDeltaMinor += signed;
      p.pendingCount += 1;
    }
    // rejected and void entries count toward nothing
  }
  return positions;
}

export function reconciliationDiscrepancy(entries: Entry[]): number {
  let buyIns = 0;
  let cashOuts = 0;
  for (const e of entries) {
    if (e.state !== 'verified') continue;
    if (isBuyLike(e)) buyIns += e.amount_minor;
    else cashOuts += e.amount_minor;
  }
  return buyIns - cashOuts;
}

/** People look at the list to see who's up: net descending. */
export function sortNetsDescending(nets: PlayerNet[]): PlayerNet[] {
  return [...nets].sort((a, b) => b.settleable_minor - a.settleable_minor);
}

export function pendingEntries(entries: Entry[]): Entry[] {
  return entries
    .filter((e) => e.state === 'pending')
    .sort((a, b) => a.created_at.localeCompare(b.created_at)); // oldest first
}
