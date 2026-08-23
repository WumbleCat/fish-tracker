import { computePositions, pendingEntries, reconciliationDiscrepancy, sortNetsDescending } from './ledger';
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
