/** The offline queue: an entry logged offline appears as not-sent, flushes
 * exactly once on reconnect, and the idempotency key prevents a double-log.
 * Verifications are never queued (see actions.test.ts). */

import { useEntryQueue, type QueuedEntry, type SendResult } from './queue';

function drain() {
  useEntryQueue.setState({ entries: [], flushing: false });
}

const draft = (key: string): Omit<QueuedEntry, 'queuedAt'> => ({
  clientKey: key,
  gameId: 'g1',
  entryType: 'rebuy',
  amountMinor: 2000,
});

describe('offline entry queue', () => {
  beforeEach(drain);

  it('an entry logged offline is held in a visible not-sent state', () => {
    useEntryQueue.getState().enqueue(draft('k1'));
    const held = useEntryQueue.getState().entries;
    expect(held).toHaveLength(1);
    expect(held[0].clientKey).toBe('k1');
    expect(held[0].failedCode).toBeUndefined();
  });

  it('flush sends each entry exactly once and clears it on success', async () => {
    const sent: string[] = [];
    useEntryQueue.getState().enqueue(draft('k1'));
    useEntryQueue.getState().enqueue(draft('k2'));
    const send = async (e: QueuedEntry): Promise<SendResult> => {
      sent.push(e.clientKey);
      return { ok: true };
    };
    await useEntryQueue.getState().flush(send);
    expect(sent).toEqual(['k1', 'k2']);
    expect(useEntryQueue.getState().entries).toHaveLength(0);

    // a second flush after reconnect has nothing to resend
    await useEntryQueue.getState().flush(send);
    expect(sent).toEqual(['k1', 'k2']);
  });

  it('every replay of an entry carries the SAME client key — the server dedupes on it', async () => {
    const keys: string[] = [];
    useEntryQueue.getState().enqueue(draft('stable-key'));
    // transient failure first: entry stays queued
    await useEntryQueue.getState().flush(async (e) => {
      keys.push(e.clientKey);
      return { ok: false };
    });
    expect(useEntryQueue.getState().entries).toHaveLength(1);
    // reconnect: replayed with the identical key, so the server can't double-log
    await useEntryQueue.getState().flush(async (e) => {
      keys.push(e.clientKey);
      return { ok: true };
    });
    expect(keys).toEqual(['stable-key', 'stable-key']);
    expect(useEntryQueue.getState().entries).toHaveLength(0);
  });

  it('concurrent flushes are single-flight — no interleaved double-send', async () => {
    const sent: string[] = [];
    useEntryQueue.getState().enqueue(draft('k1'));
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const slowSend = async (e: QueuedEntry): Promise<SendResult> => {
      sent.push(e.clientKey);
      await gate;
      return { ok: true };
    };
    const first = useEntryQueue.getState().flush(slowSend);
    const second = useEntryQueue.getState().flush(slowSend); // no-op: already flushing
    release();
    await Promise.all([first, second]);
    expect(sent).toEqual(['k1']);
  });

  it('a domain refusal marks the entry failed and stops retrying it', async () => {
    useEntryQueue.getState().enqueue(draft('k1'));
    await useEntryQueue.getState().flush(async () => ({
      ok: false,
      permanent: true,
      code: 'cashout_already_live',
    }));
    const held = useEntryQueue.getState().entries;
    expect(held).toHaveLength(1);
    expect(held[0].failedCode).toBe('cashout_already_live');

    // subsequent flushes skip it — it needs the user, not a retry
    const sent: string[] = [];
    await useEntryQueue.getState().flush(async (e) => {
      sent.push(e.clientKey);
      return { ok: true };
    });
    expect(sent).toEqual([]);
  });
});
