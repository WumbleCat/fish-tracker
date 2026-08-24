/** The host verifies three entries without the mouse: v, v, v. And there is
 * no key, button or gesture that verifies more than one at a time. */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import type { Entry } from '../lib/types';
import { VerifyQueue } from './VerifyQueue';

let seq = 0;
function pending(userId: string, amountMinor: number): Entry {
  seq += 1;
  return {
    id: `e${seq}`,
    game_id: 'g1',
    user_id: userId,
    entry_type: 'buy_in',
    amount_minor: amountMinor,
    state: 'pending',
    created_at: new Date(2026, 0, 1, 20, 0, seq).toISOString(),
    logged_by: userId,
    verified_by: null,
    verified_at: null,
    rejection_note: null,
    void_reason: null,
    amends_entry_id: null,
    client_key: null,
    version: 1,
  };
}

const nameOf = (id: string) => ({ a: 'Alice', b: 'Bob', c: 'Carol' })[id] ?? id;

describe('VerifyQueue keyboard flow', () => {
  it('verifies three entries in order with only the v key', async () => {
    const user = userEvent.setup();
    let entries = [pending('a', 5000), pending('b', 2000), pending('c', 2000)];
    const verified: string[] = [];

    const { rerender } = render(
      <VerifyQueue
        entries={entries}
        nameOf={nameOf}
        currency="GBP"
        exponent={2}
        onVerify={(entry) => {
          verified.push(entry.id);
          entries = entries.filter((e) => e.id !== entry.id);
        }}
        onReject={() => {}}
      />,
    );

    const ids = entries.map((e) => e.id);
    for (let i = 0; i < 3; i++) {
      await user.keyboard('v');
      rerender(
        <VerifyQueue
          entries={entries}
          nameOf={nameOf}
          currency="GBP"
          exponent={2}
          onVerify={(entry) => {
            verified.push(entry.id);
            entries = entries.filter((e) => e.id !== entry.id);
          }}
          onReject={() => {}}
        />,
      );
    }
    // oldest first, each acted on individually
    expect(verified).toEqual(ids);
  });

  it('x opens a rejection note on the selected entry, Enter sends it', async () => {
    const user = userEvent.setup();
    const rejected: Array<{ id: string; note: string | null }> = [];
    render(
      <VerifyQueue
        entries={[pending('a', 4000)]}
        nameOf={nameOf}
        currency="GBP"
        exponent={2}
        onVerify={() => {}}
        onReject={(entry, note) => rejected.push({ id: entry.id, note })}
      />,
    );
    await user.keyboard('x');
    await user.keyboard('you put in 20, not 40{Enter}');
    expect(rejected).toHaveLength(1);
    expect(rejected[0].note).toBe('you put in 20, not 40');
  });

  it('arrow keys move the selection', async () => {
    const user = userEvent.setup();
    const verified: string[] = [];
    const entries = [pending('a', 100), pending('b', 200)];
    render(
      <VerifyQueue
        entries={entries}
        nameOf={nameOf}
        currency="GBP"
        exponent={2}
        onVerify={(entry) => verified.push(entry.id)}
        onReject={() => {}}
      />,
    );
    await user.keyboard('{ArrowDown}v');
    expect(verified).toEqual([entries[1].id]);
  });

  it('offers no verify-all affordance, by design', () => {
    render(
      <VerifyQueue
        entries={[pending('a', 100), pending('b', 200), pending('c', 300)]}
        nameOf={nameOf}
        currency="GBP"
        exponent={2}
        onVerify={() => {}}
        onReject={() => {}}
      />,
    );
    expect(screen.queryByText(/verify all/i)).toBeNull();
    expect(screen.getAllByRole('button', { name: /^verify$/i })).toHaveLength(3);
  });

  it('an entry acted on leaves the queue at once while the server is still deciding', () => {
    const entries = [pending('a', 100), pending('b', 200)];
    render(
      <VerifyQueue
        entries={entries}
        inflight={{ [entries[0].id]: 'verify' }}
        nameOf={nameOf}
        currency="GBP"
        exponent={2}
        onVerify={() => {}}
        onReject={() => {}}
      />,
    );
    // its state is still 'pending' — only the queue view moved on
    expect(entries[0].state).toBe('pending');
    expect(screen.queryByText('Alice')).toBeNull();
    expect(screen.getByText('Bob')).toBeInTheDocument();
  });

  it('a row the server has not confirmed yet shows as logging and cannot be verified', () => {
    const claim = { ...pending('a', 100), client_key: 'ck-1' };
    claim.id = 'ck-1'; // optimistic: id is still the client key
    render(
      <VerifyQueue
        entries={[claim]}
        nameOf={nameOf}
        currency="GBP"
        exponent={2}
        onVerify={() => {}}
        onReject={() => {}}
      />,
    );
    expect(screen.getByText('logging…')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^verify$/i })).toBeNull();
  });

  it('shortcuts are suppressed while typing in an input', async () => {
    const user = userEvent.setup();
    const verified: string[] = [];
    render(
      <div>
        <input aria-label="player name" />
        <VerifyQueue
          entries={[pending('a', 100)]}
          nameOf={nameOf}
          currency="GBP"
          exponent={2}
          onVerify={(entry) => verified.push(entry.id)}
          onReject={() => {}}
        />
      </div>,
    );
    await user.click(screen.getByLabelText('player name'));
    await user.keyboard('victor');
    expect(verified).toHaveLength(0);
    expect(screen.getByLabelText('player name')).toHaveValue('victor');
  });
});
