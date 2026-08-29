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

/** Whether a player still has chips in front of them: they have verified
 * entries and the last one isn't a cash-out. Mirrors the server's own
 * "settled position" test. */
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
  playersInPlayCount: number;
}

/**
 * The figure at the foot of the net list, and what it means.
 *
 * The sum of the live nets is the reconciliation identity with its sign
 * flipped, which makes it three different statements over a night: the value
 * of the chips still out, a table that balances, or the gap the settle screen
 * will gate on. In-play is checked before zero on purpose — a total that
 * happens to land on zero while chips are out has coincided, not balanced.
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
