/** Own-entry display may be optimistic; verification never is, and never
 * queues: offline it refuses outright, and nothing enters the entry queue. */

import { closeGame, OfflineError, rejectEntry, verifyEntry } from './actions';
import { useEntryQueue } from './queue';
import type { Entry } from './types';

const entry: Entry = {
  id: 'e1',
  game_id: 'g1',
  user_id: 'u1',
  entry_type: 'buy_in',
  amount_minor: 2000,
  state: 'pending',
  created_at: new Date().toISOString(),
  logged_by: 'u1',
  verified_by: null,
  verified_at: null,
  rejection_note: null,
  void_reason: null,
  amends_entry_id: null,
  version: 1,
};

describe('verification is never optimistic and never queued', () => {
  beforeEach(() => {
    useEntryQueue.setState({ entries: [], flushing: false });
  });

  it('verify offline refuses and leaves the queue untouched', async () => {
    await expect(verifyEntry(entry, false)).rejects.toBeInstanceOf(OfflineError);
    expect(useEntryQueue.getState().entries).toHaveLength(0);
  });

  it('reject offline refuses and leaves the queue untouched', async () => {
    await expect(rejectEntry(entry, 'note', false)).rejects.toBeInstanceOf(OfflineError);
    expect(useEntryQueue.getState().entries).toHaveLength(0);
  });

  it('close offline refuses — a settlement is never computed from stale state', async () => {
    await expect(closeGame('g1', false, 1, false)).rejects.toBeInstanceOf(OfflineError);
    expect(useEntryQueue.getState().entries).toHaveLength(0);
  });

  it('own entries ARE optimistic: enqueueing shows them immediately as not-sent', () => {
    useEntryQueue.getState().enqueue({
      clientKey: 'k1',
      gameId: 'g1',
      entryType: 'buy_in',
      amountMinor: 2000,
    });
    expect(useEntryQueue.getState().entries).toHaveLength(1);
  });
});
