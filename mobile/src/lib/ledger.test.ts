import {
  computePositions,
  pendingEntries,
  reconciliationDiscrepancy,
  sortNetsDescending,
  tableTotal,
} from './ledger';
import type { Entry, EntryState, EntryType, PlayerNet } from './types';

let seq = 0;
function entry(userId: string, type: EntryType, amountMinor: number, state: EntryState): Entry {
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
    verified_by: null,
    verified_at: null,
    rejection_note: null,
    void_reason: null,
    amends_entry_id: null,
    version: 1,
  };
}

describe('computePositions', () => {
  it('pending amounts never merge into the net figure', () => {
    const positions = computePositions([
      entry('a', 'buy_in', 5000, 'verified'),
      entry('a', 'cash_out', 9000, 'pending'),
    ]);
    const a = positions.get('a')!;
    expect(a.settleableMinor).toBe(-5000);
    expect(a.pendingDeltaMinor).toBe(9000);
  });

  it('rejected and void entries count toward nothing', () => {
    const positions = computePositions([
      entry('a', 'buy_in', 5000, 'rejected'),
      entry('a', 'rebuy', 3000, 'void'),
    ]);
    expect(positions.get('a')!.settleableMinor).toBe(0);
    expect(positions.get('a')!.pendingDeltaMinor).toBe(0);
  });

  it('a player mid-game shows their buy-ins, in the red', () => {
    const positions = computePositions([
      entry('b', 'buy_in', 5000, 'verified'),
      entry('b', 'rebuy', 5000, 'verified'),
    ]);
    expect(positions.get('b')!.settleableMinor).toBe(-10000);
  });
});

describe('reconciliation', () => {
  it('flags a game that does not balance', () => {
    expect(
      reconciliationDiscrepancy([
        entry('a', 'buy_in', 10000, 'verified'),
        entry('a', 'cash_out', 9000, 'verified'),
      ]),
    ).toBe(1000);
  });
});

describe('sortNetsDescending', () => {
  it('puts the biggest winner first — who is up, at a glance', () => {
    const nets: PlayerNet[] = [
      { user_id: 'down', settleable_minor: -5000, pending_delta_minor: 0, pending_count: 0 },
      { user_id: 'up', settleable_minor: 8000, pending_delta_minor: 0, pending_count: 0 },
      { user_id: 'even', settleable_minor: 0, pending_delta_minor: 0, pending_count: 0 },
    ];
    expect(sortNetsDescending(nets).map((n) => n.user_id)).toEqual(['up', 'even', 'down']);
  });
});

describe('pendingEntries', () => {
  it('is oldest first — the verify queue order', () => {
    const first = entry('a', 'buy_in', 100, 'pending');
    const mid = entry('b', 'buy_in', 200, 'verified');
    const second = entry('b', 'rebuy', 300, 'pending');
    expect(pendingEntries([second, mid, first]).map((e) => e.id)).toEqual([first.id, second.id]);
  });
});

describe('tableTotal', () => {
  const net = (userId: string, settleable: number, pending = 0): PlayerNet => ({
    user_id: userId,
    settleable_minor: settleable,
    pending_delta_minor: pending,
    pending_count: pending === 0 ? 0 : 1,
  });

  it('reads a table mid-game as chips still out, not as a discrepancy', () => {
    const total = tableTotal(
      [net('a', -5000), net('b', -5000)],
      [entry('a', 'buy_in', 5000, 'verified'), entry('b', 'buy_in', 5000, 'verified')],
    );
    expect(total.totalNetMinor).toBe(-10000);
    expect(total.status).toBe('in-play');
    expect(total.playersInPlayCount).toBe(2);
  });

  it('balances once everybody has a verified cash-out', () => {
    const total = tableTotal(
      [net('a', 3000), net('b', -3000)],
      [
        entry('a', 'buy_in', 5000, 'verified'),
        entry('b', 'buy_in', 5000, 'verified'),
        entry('a', 'cash_out', 8000, 'verified'),
        entry('b', 'cash_out', 2000, 'verified'),
      ],
    );
    expect(total.status).toBe('balanced');
  });

  it('names a gap once nobody holds chips and the total still is not zero', () => {
    const total = tableTotal(
      [net('a', 3000), net('b', -4000)],
      [
        entry('a', 'buy_in', 5000, 'verified'),
        entry('b', 'buy_in', 5000, 'verified'),
        entry('a', 'cash_out', 8000, 'verified'),
        entry('b', 'cash_out', 1000, 'verified'),
      ],
    );
    expect(total.totalNetMinor).toBe(-1000);
    expect(total.status).toBe('gap');
  });

  it('does not call a table balanced while chips are still out', () => {
    // a is still playing; b's overpaid cash-out happens to cancel her buy-in
    const total = tableTotal(
      [net('a', -5000), net('b', 5000)],
      [
        entry('a', 'buy_in', 5000, 'verified'),
        entry('b', 'buy_in', 5000, 'verified'),
        entry('b', 'cash_out', 10000, 'verified'),
      ],
    );
    expect(total.totalNetMinor).toBe(0);
    expect(total.status).toBe('in-play');
  });

  it('counts a player who rebought after cashing out as back in play', () => {
    const total = tableTotal(
      [net('a', -4000)],
      [
        entry('a', 'buy_in', 5000, 'verified'),
        entry('a', 'cash_out', 6000, 'verified'),
        entry('a', 'rebuy', 5000, 'verified'),
      ],
    );
    expect(total.status).toBe('in-play');
  });

  it('keeps pending out of the total and beside it', () => {
    const total = tableTotal(
      [net('a', 0), net('b', 0, -4000)],
      [
        entry('a', 'buy_in', 5000, 'verified'),
        entry('a', 'cash_out', 5000, 'verified'),
        entry('b', 'buy_in', 4000, 'pending'),
      ],
    );
    expect(total.totalNetMinor).toBe(0);
    expect(total.totalPendingMinor).toBe(-4000);
    expect(total.status).toBe('balanced'); // a claim is not a chip position
  });

  it('reads an empty table as balanced', () => {
    expect(tableTotal([], []).status).toBe('balanced');
  });
});
