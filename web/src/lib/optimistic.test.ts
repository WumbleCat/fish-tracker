/** Optimistic rows are claims, keyed so the server row replaces them in
 * place; money never comes from them. */

import { describe, expect, it } from 'vitest';

import { computePositions, computeTotals } from './ledger';
import {
  entryKey,
  mergeEntries,
  optimisticEntry,
  pruneOptimistic,
  undoMessage,
} from './optimistic';
import type { Entry } from './types';

const serverRow = (over: Partial<Entry>): Entry => ({
  id: 'srv-1',
  client_key: null,
  game_id: 'g',
  user_id: 'bob',
  entry_type: 'buy_in',
  amount_minor: 2000,
  state: 'verified',
  created_at: '2026-01-01T20:00:00Z',
  logged_by: 'bob',
  verified_by: 'host',
  verified_at: '2026-01-01T20:01:00Z',
  rejection_note: null,
  void_reason: null,
  amends_entry_id: null,
  version: 2,
  ...over,
});

const claim = optimisticEntry({
  clientKey: 'ck-1',
  gameId: 'g',
  userId: 'bob',
  loggedBy: 'bob',
  entryType: 'rebuy',
  amountMinor: 4000,
});

describe('mergeEntries', () => {
  it('appends optimistic rows the server has not returned yet', () => {
    const merged = mergeEntries([serverRow({})], [claim]);
    expect(merged.map(entryKey)).toEqual(['srv-1', 'ck-1']);
  });

  it('drops the optimistic row once the server row with the same key lands — no duplicate', () => {
    const landed = serverRow({ id: 'srv-2', client_key: 'ck-1', state: 'pending' });
    const merged = mergeEntries([serverRow({}), landed], [claim]);
    expect(merged).toHaveLength(2);
    expect(merged.map(entryKey)).toEqual(['srv-1', 'ck-1']); // same key, same node
  });

  it('returns the server array itself when there is nothing to add', () => {
    const server = [serverRow({})];
    expect(mergeEntries(server, [])).toBe(server);
  });
});

describe('pruneOptimistic', () => {
  it('keeps the same array when nothing landed, so setState can no-op', () => {
    const rows = [claim];
    expect(pruneOptimistic(rows, [serverRow({})])).toBe(rows);
  });

  it('removes rows the server now returns', () => {
    const landed = serverRow({ id: 'srv-2', client_key: 'ck-1', state: 'pending' });
    expect(pruneOptimistic([claim], [landed])).toEqual([]);
  });
});

describe('money stays on server truth', () => {
  it('an optimistic row is pending and so never reaches the settleable net or verified totals', () => {
    const merged = mergeEntries([serverRow({})], [claim]);
    const positions = computePositions(merged);
    expect(positions.get('bob')?.settleableMinor).toBe(-2000); // the verified buy-in only
    expect(positions.get('bob')?.pendingDeltaMinor).toBe(-4000); // the claim, beside it
    const totals = computeTotals(merged);
    expect(totals.verifiedBuyInsMinor).toBe(2000);
  });
});

describe('undoMessage', () => {
  it('names what was undone, for whom, and why', () => {
    expect(
      undoMessage({
        action: 'verify',
        amount: '£20.00',
        entryType: 'buy_in',
        name: 'Bob',
        reason: 'version conflict',
      }),
    ).toBe('Undid verify of £20.00 buy-in for Bob — version conflict.');
  });
});
