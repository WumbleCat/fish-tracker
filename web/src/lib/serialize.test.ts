import { describe, expect, it } from 'vitest';

import { serialize } from './serialize';

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('serialize', () => {
  it('runs calls for the same key strictly in order, even when the first is slow', async () => {
    const order: string[] = [];
    const slow = serialize('e1', async () => {
      await new Promise((r) => setTimeout(r, 20));
      order.push('first');
    });
    const fast = serialize('e1', async () => {
      order.push('second');
    });
    await Promise.all([slow, fast]);
    expect(order).toEqual(['first', 'second']);
  });

  it('lets different keys run concurrently', async () => {
    const order: string[] = [];
    const a = serialize('a', async () => {
      await new Promise((r) => setTimeout(r, 20));
      order.push('a');
    });
    const b = serialize('b', async () => {
      order.push('b');
    });
    await Promise.all([a, b]);
    expect(order).toEqual(['b', 'a']);
  });

  it('a failure neither blocks nor fails the call queued behind it', async () => {
    const failing = serialize('k', async () => {
      throw new Error('boom');
    });
    const after = serialize('k', async () => 'ok');
    await expect(failing).rejects.toThrow('boom');
    await expect(after).resolves.toBe('ok');
    await tick();
  });
});
