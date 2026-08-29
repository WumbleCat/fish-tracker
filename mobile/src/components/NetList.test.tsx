/** The foot of the net list. The sum of the live nets is the reconciliation
 * identity with its sign flipped, so what it is allowed to *say* matters as
 * much as what it adds up to: chips still out is not a discrepancy, and a
 * real gap must not be softened into one. */

import { render, screen } from '@testing-library/react-native';

import type { Entry, Game, Member, PlayerNet } from '../lib/types';
import { NetList } from './NetList';

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
    verified_by: state === 'verified' ? 'u-host' : null,
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
    host_id: 'u-host',
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
      member({ user_id: 'u-host', display_name: 'Ravi', role: 'host' }),
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

const meaning = () => screen.getByTestId('net-total-meaning').props.children as string;

describe('the total at the foot of the net list', () => {
  it('adds the live nets up and reads a live table as chips still out', async () => {
    await render(
      <NetList
        game={game({
          entries: [entry('u-host', 'buy_in', 5000), entry('u-sam', 'buy_in', 5000)],
          nets: [net('u-host', -5000), net('u-sam', -5000)],
        })}
        meId="u-sam"
      />,
    );

    expect(screen.getByTestId('net-total')).toBeTruthy();
    expect(screen.getByLabelText('amount −£100.00')).toBeTruthy();
    expect(meaning()).toContain('£100.00 still on the table');
    // never dressed as a problem while the chips are genuinely out
    expect(meaning()).not.toMatch(/short|over|gap/i);
  });

  it('says a table balances once everybody has a verified cash-out', async () => {
    await render(
      <NetList
        game={game({
          entries: [
            entry('u-host', 'buy_in', 5000),
            entry('u-sam', 'buy_in', 5000),
            entry('u-host', 'cash_out', 8000),
            entry('u-sam', 'cash_out', 2000),
          ],
          nets: [net('u-host', 3000), net('u-sam', -3000)],
        })}
        meId="u-sam"
      />,
    );

    expect(meaning()).toContain('balances');
  });

  it('names a real gap in the same words the settle screen uses', async () => {
    await render(
      <NetList
        game={game({
          entries: [
            entry('u-host', 'buy_in', 5000),
            entry('u-sam', 'buy_in', 5000),
            entry('u-host', 'cash_out', 8000),
            entry('u-sam', 'cash_out', 1000),
          ],
          nets: [net('u-host', 3000), net('u-sam', -4000)],
        })}
        meId="u-sam"
      />,
    );

    expect(meaning()).toContain('£10.00 short');
  });

  it('never folds pending into the total', async () => {
    await render(
      <NetList
        game={game({
          entries: [
            entry('u-host', 'buy_in', 5000),
            entry('u-host', 'cash_out', 5000),
            entry('u-sam', 'buy_in', 4000, 'pending'),
          ],
          nets: [net('u-host', 0), net('u-sam', 0, -4000)],
        })}
        meId="u-sam"
      />,
    );

    expect(meaning()).toContain('balances'); // a claim is not a chip position
    expect(screen.getAllByText('−£40.00 pending')).toHaveLength(2);
  });

  it('reads the exponent from the game rather than assuming pence', async () => {
    await render(
      <NetList
        game={game({
          currency: 'JPY',
          currency_exponent: 0,
          entries: [entry('u-sam', 'buy_in', 1000)],
          nets: [net('u-sam', -1000)],
        })}
        meId="u-sam"
      />,
    );

    expect(meaning()).toContain('¥1000 still on the table');
  });
});
