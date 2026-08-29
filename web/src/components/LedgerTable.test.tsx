/** The foot of the ledger and the seat control beside each row.
 *
 * The total is the reconciliation identity with its sign flipped, so what it
 * is allowed to *say* matters as much as what it adds up to: chips still out
 * is not a discrepancy, and a real gap must not be softened into one. */

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { Entry, Game, Member, PlayerNet } from '../lib/types';
import { LedgerTable } from './LedgerTable';

let seq = 0;
function entry(
  userId: string,
  type: Entry['entry_type'],
  amountMinor: number,
  state: Entry['state'] = 'verified',
): Entry {
  seq += 1;
  return {
    id: `e${seq}`,
    game_id: 'g1',
    user_id: userId,
    entry_type: type,
    amount_minor: amountMinor,
    state,
    created_at: new Date(2026, 7, 29, 20, 0, seq).toISOString(),
    logged_by: userId,
    verified_by: state === 'verified' ? 'host-1' : null,
    verified_at: state === 'verified' ? new Date().toISOString() : null,
    rejection_note: null,
    void_reason: null,
    amends_entry_id: null,
    client_key: null,
    version: 1,
  };
}

const member = (over: Partial<Member> & { user_id: string; display_name: string }): Member => ({
  is_guest: false,
  can_host: true,
  role: 'player',
  joined_at: '',
  departed_at: null,
  departed_unsettled: false,
  ...over,
});

const net = (userId: string, settleable: number, pending = 0): PlayerNet => ({
  user_id: userId,
  settleable_minor: settleable,
  pending_delta_minor: pending,
  pending_count: pending === 0 ? 0 : 1,
});

function game(over: Partial<Game> = {}): Game {
  return {
    id: 'g1',
    name: 'Tonight',
    join_code: 'ABCD22',
    state: 'running',
    host_id: 'host-1',
    currency: 'GBP',
    currency_exponent: 2,
    stake_minor: null,
    small_blind_minor: null,
    big_blind_minor: null,
    events: [],
    created_at: new Date().toISOString(),
    closed_at: null,
    version: 1,
    members: [
      member({ user_id: 'host-1', display_name: 'Alice', role: 'host' }),
      member({ user_id: 'u-sam', display_name: 'Sam' }),
    ],
    entries: [],
    nets: [],
    totals: {
      verified_buy_ins_minor: 0,
      verified_cash_outs_minor: 0,
      chips_on_table_minor: 0,
      pending_count: 0,
    },
    ...over,
  };
}

const totalNet = () => screen.getByTestId('total-live-net').textContent;
const meaning = () => screen.getByTestId('total-live-net-meaning').textContent ?? '';

describe('the total at the foot of the ledger', () => {
  it('adds the live nets up and reads a live table as chips still out', () => {
    render(
      <LedgerTable
        game={game({
          entries: [entry('host-1', 'buy_in', 5000), entry('u-sam', 'buy_in', 5000)],
          nets: [net('host-1', -5000), net('u-sam', -5000)],
        })}
      />,
    );

    expect(totalNet()).toBe('−£100.00');
    expect(meaning()).toContain('£100.00 still on the table');
    expect(meaning()).toContain('2 players haven’t cashed out');
    // never dressed as a problem while the chips are genuinely out
    expect(meaning()).not.toMatch(/short|over|gap/i);
  });

  it('says a table balances once everybody has a verified cash-out', () => {
    render(
      <LedgerTable
        game={game({
          entries: [
            entry('host-1', 'buy_in', 5000),
            entry('u-sam', 'buy_in', 5000),
            entry('host-1', 'cash_out', 8000),
            entry('u-sam', 'cash_out', 2000),
          ],
          nets: [net('host-1', 3000), net('u-sam', -3000)],
        })}
      />,
    );

    expect(totalNet()).toBe('£0.00');
    expect(meaning()).toContain('balances');
  });

  it('names a real gap in the same words settlement will use', () => {
    render(
      <LedgerTable
        game={game({
          entries: [
            entry('host-1', 'buy_in', 5000),
            entry('u-sam', 'buy_in', 5000),
            entry('host-1', 'cash_out', 8000),
            entry('u-sam', 'cash_out', 1000),
          ],
          nets: [net('host-1', 3000), net('u-sam', -4000)],
        })}
      />,
    );

    expect(totalNet()).toBe('−£10.00');
    expect(meaning()).toContain('£10.00 short');
  });

  it('never folds pending into the total', () => {
    render(
      <LedgerTable
        game={game({
          entries: [
            entry('host-1', 'buy_in', 5000),
            entry('host-1', 'cash_out', 5000),
            entry('u-sam', 'buy_in', 4000, 'pending'),
          ],
          nets: [net('host-1', 0), net('u-sam', 0, -4000)],
        })}
      />,
    );

    expect(totalNet()).toBe('£0.00');
    // once on Sam's row, once in the foot — beside the total, never inside it
    const pendingCells = screen.getAllByText(/−£40\.00 awaiting verification/);
    expect(pendingCells).toHaveLength(2);
  });

  it('reads the exponent from the game rather than assuming pence', () => {
    render(
      <LedgerTable
        game={game({
          currency: 'JPY',
          currency_exponent: 0,
          entries: [entry('u-sam', 'buy_in', 1000)],
          nets: [net('u-sam', -1000)],
        })}
      />,
    );

    expect(totalNet()).toBe('−¥1000');
    expect(meaning()).toContain('¥1000 still on the table');
  });
});

describe('the seat control on a row', () => {
  const removable = game({
    entries: [entry('u-sam', 'buy_in', 5000)],
    nets: [net('u-sam', -5000)],
  });

  it('is absent entirely for anyone who cannot manage seats', () => {
    render(<LedgerTable game={removable} />);
    expect(screen.queryByRole('button', { name: /remove/i })).toBeNull();
  });

  it('offers each seated player except the host', () => {
    render(<LedgerTable game={removable} onRemove={() => {}} />);

    expect(screen.getByRole('button', { name: 'Remove Sam' })).toBeTruthy();
    // the host leaves by handing the game over, not by removing themselves
    expect(screen.queryByRole('button', { name: 'Remove Alice' })).toBeNull();
  });

  it('offers nothing for somebody already gone', () => {
    render(
      <LedgerTable
        game={game({
          members: [
            member({ user_id: 'host-1', display_name: 'Alice', role: 'host' }),
            member({
              user_id: 'u-jo',
              display_name: 'Jo',
              departed_at: '2026-08-29T21:00:00Z',
            }),
          ],
        })}
        onRemove={() => {}}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Remove Jo' })).toBeNull();
  });

  it('names the person, and asking to remove them does not also select the row', async () => {
    const onRemove = vi.fn();
    const onSelect = vi.fn();
    render(<LedgerTable game={removable} onRemove={onRemove} onSelect={onSelect} />);

    await userEvent.click(screen.getByRole('button', { name: 'Remove Sam' }));

    expect(onRemove).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'u-sam', display_name: 'Sam' }),
    );
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('leaves the money columns untouched when the control is present', () => {
    render(<LedgerTable game={removable} onRemove={() => {}} />);

    const row = screen.getByRole('row', { name: /Sam/ });
    expect(within(row).getByText('−£50.00')).toBeTruthy();
  });
});
