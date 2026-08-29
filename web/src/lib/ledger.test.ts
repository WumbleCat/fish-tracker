import { describe, expect, it } from 'vitest';

import {
  computePositions,
  computeTotals,
  isReconciled,
  pendingEntries,
  reconciliationDiscrepancy,
  tableTotal,
} from './ledger';
import type { Entry, EntryState, EntryType } from './types';

let seq = 0;
function entry(
  userId: string,
  type: EntryType,
  amountMinor: number,
  state: EntryState,
): Entry {
  seq += 1;
  return {
    id: `e${seq}`,
    game_id: 'g1',
    user_id: userId,
    entry_type: type,
    amount_minor: amountMinor,
    state,
    created_at: new Date(2026, 0, 1, 20, 0, seq).toISOString(),
    logged_by: userId,
    verified_by: state === 'verified' ? 'host' : null,
    verified_at: state === 'verified' ? new Date().toISOString() : null,
    rejection_note: null,
    void_reason: null,
    amends_entry_id: null,
    client_key: null,
    version: 1,
  };
}

describe('computePositions', () => {
  it('derives the net from verified entries only', () => {
    const positions = computePositions([
      entry('alice', 'buy_in', 5000, 'verified'),
      entry('alice', 'rebuy', 5000, 'verified'),
      entry('alice', 'cash_out', 4000, 'verified'),
    ]);
    expect(positions.get('alice')!.settleableMinor).toBe(-6000);
  });

  it('never merges pending amounts into the net', () => {
    const positions = computePositions([
      entry('alice', 'buy_in', 5000, 'verified'),
      entry('alice', 'cash_out', 9000, 'pending'),
    ]);
    const alice = positions.get('alice')!;
    expect(alice.settleableMinor).toBe(-5000); // untouched by the claim
    expect(alice.pendingDeltaMinor).toBe(9000); // sits beside it
    expect(alice.pendingCount).toBe(1);
  });

  it('counts rejected and void entries toward nothing', () => {
    const positions = computePositions([
      entry('alice', 'buy_in', 5000, 'rejected'),
      entry('alice', 'buy_in', 2000, 'void'),
      entry('alice', 'buy_in', 1000, 'verified'),
    ]);
    const alice = positions.get('alice')!;
    expect(alice.settleableMinor).toBe(-1000);
    expect(alice.pendingDeltaMinor).toBe(0);
  });

  it('shows a player still in the game as their buy-ins, in the red', () => {
    const positions = computePositions([
      entry('bob', 'buy_in', 5000, 'verified'),
      entry('bob', 'rebuy', 5000, 'verified'),
      entry('bob', 'rebuy', 5000, 'verified'),
    ]);
    // £150 down is £150 down — never softened, dashed or hidden
    expect(positions.get('bob')!.settleableMinor).toBe(-15000);
  });
});

describe('computeTotals', () => {
  const entries = [
    entry('alice', 'buy_in', 5000, 'verified'),
    entry('bob', 'buy_in', 5000, 'verified'),
    entry('bob', 'rebuy', 2000, 'pending'),
    entry('alice', 'cash_out', 3000, 'pending'),
    entry('bob', 'buy_in', 9999, 'rejected'),
    entry('alice', 'rebuy', 1234, 'void'),
  ];

  it('chips on the table includes pending, settleable does not', () => {
    const t = computeTotals(entries);
    expect(t.verifiedBuyInsMinor).toBe(10000);
    expect(t.verifiedCashOutsMinor).toBe(0);
    // 10000 verified + 2000 pending rebuy − 3000 pending cash-out
    expect(t.chipsOnTableMinor).toBe(9000);
    expect(t.pendingCount).toBe(2);
  });

  it('the difference between the two totals is exactly the outstanding claims', () => {
    const t = computeTotals(entries);
    const settleableTable = t.verifiedBuyInsMinor - t.verifiedCashOutsMinor;
    expect(t.chipsOnTableMinor - settleableTable).toBe(2000 - 3000);
  });
});

describe('reconciliation', () => {
  it('flags a session that does not balance', () => {
    const entries = [
      entry('alice', 'buy_in', 10000, 'verified'),
      entry('alice', 'cash_out', 9000, 'verified'),
    ];
    expect(isReconciled(entries)).toBe(false);
    expect(reconciliationDiscrepancy(entries)).toBe(1000);
  });

  it('a balanced session reconciles to exactly zero', () => {
    const entries = [
      entry('alice', 'buy_in', 10000, 'verified'),
      entry('bob', 'buy_in', 5000, 'verified'),
      entry('alice', 'cash_out', 4000, 'verified'),
      entry('bob', 'cash_out', 11000, 'verified'),
    ];
    expect(isReconciled(entries)).toBe(true);
    expect(reconciliationDiscrepancy(entries)).toBe(0);
  });

  it('pending entries do not affect reconciliation of verified totals', () => {
    const entries = [
      entry('alice', 'buy_in', 10000, 'verified'),
      entry('alice', 'cash_out', 10000, 'verified'),
      entry('alice', 'rebuy', 5000, 'pending'),
    ];
    expect(isReconciled(entries)).toBe(true);
  });
});

describe('pendingEntries', () => {
  it('returns only pending, oldest first — the verification queue order', () => {
    const first = entry('alice', 'buy_in', 100, 'pending');
    const verified = entry('bob', 'buy_in', 200, 'verified');
    const second = entry('bob', 'rebuy', 300, 'pending');
    const queue = pendingEntries([second, verified, first]);
    expect(queue.map((e) => e.id)).toEqual([first.id, second.id]);
  });
});

function net(userId: string, settleableMinor: number, pendingDeltaMinor = 0) {
  return {
    user_id: userId,
    settleable_minor: settleableMinor,
    pending_delta_minor: pendingDeltaMinor,
    pending_count: pendingDeltaMinor === 0 ? 0 : 1,
  };
}

describe('tableTotal', () => {
  it('reads a table mid-game as chips still out, not as a discrepancy', () => {
    const entries = [
      entry('alice', 'buy_in', 5000, 'verified'),
      entry('bob', 'buy_in', 5000, 'verified'),
    ];

    const total = tableTotal([net('alice', -5000), net('bob', -5000)], entries);

    expect(total.totalNetMinor).toBe(-10000);
    expect(total.status).toBe('in-play');
    expect(total.playersInPlayCount).toBe(2);
  });

  it('balances once everybody has a verified cash-out', () => {
    const entries = [
      entry('alice', 'buy_in', 5000, 'verified'),
      entry('bob', 'buy_in', 5000, 'verified'),
      entry('alice', 'cash_out', 8000, 'verified'),
      entry('bob', 'cash_out', 2000, 'verified'),
    ];

    const total = tableTotal([net('alice', 3000), net('bob', -3000)], entries);

    expect(total.totalNetMinor).toBe(0);
    expect(total.status).toBe('balanced');
  });

  it('names a gap once nobody holds chips and the total still is not zero', () => {
    const entries = [
      entry('alice', 'buy_in', 5000, 'verified'),
      entry('bob', 'buy_in', 5000, 'verified'),
      entry('alice', 'cash_out', 8000, 'verified'),
      entry('bob', 'cash_out', 1000, 'verified'),
    ];

    const total = tableTotal([net('alice', 3000), net('bob', -4000)], entries);

    expect(total.totalNetMinor).toBe(-1000); // £10 short — someone left with a stack
    expect(total.status).toBe('gap');
  });

  it('does not call a table balanced while chips are still out', () => {
    // alice is still playing; bob's overpaid cash-out happens to cancel her
    // buy-in. Zero here is a coincidence, not a reconciliation.
    const entries = [
      entry('alice', 'buy_in', 5000, 'verified'),
      entry('bob', 'buy_in', 5000, 'verified'),
      entry('bob', 'cash_out', 10000, 'verified'),
    ];

    const total = tableTotal([net('alice', -5000), net('bob', 5000)], entries);

    expect(total.totalNetMinor).toBe(0);
    expect(total.status).toBe('in-play');
  });

  it('counts a player who rebought after cashing out as back in play', () => {
    const entries = [
      entry('alice', 'buy_in', 5000, 'verified'),
      entry('alice', 'cash_out', 6000, 'verified'),
      entry('alice', 'rebuy', 5000, 'verified'),
    ];

    expect(tableTotal([net('alice', -4000)], entries).status).toBe('in-play');
  });

  it('keeps pending out of the total and beside it', () => {
    const entries = [
      entry('alice', 'buy_in', 5000, 'verified'),
      entry('alice', 'cash_out', 5000, 'verified'),
      entry('bob', 'buy_in', 4000, 'pending'),
    ];

    const total = tableTotal([net('alice', 0), net('bob', 0, -4000)], entries);

    expect(total.totalNetMinor).toBe(0);
    expect(total.totalPendingMinor).toBe(-4000);
    expect(total.status).toBe('balanced'); // a claim is not a chip position
  });

  it('ignores rejected and void entries when deciding who holds chips', () => {
    const entries = [
      entry('alice', 'buy_in', 5000, 'verified'),
      entry('alice', 'cash_out', 5000, 'verified'),
      entry('alice', 'rebuy', 9999, 'rejected'),
      entry('alice', 'rebuy', 9999, 'void'),
    ];

    expect(tableTotal([net('alice', 0)], entries).status).toBe('balanced');
  });

  it('reads an empty table as balanced', () => {
    expect(tableTotal([], []).status).toBe('balanced');
    expect(tableTotal([], []).totalNetMinor).toBe(0);
  });
});
