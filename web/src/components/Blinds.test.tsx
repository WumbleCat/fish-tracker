/** Blinds are the table's stakes, not ledger money. The two things worth
 * asserting: a blind change appears in the log carrying no amount, and the
 * control hands up integer minor units rather than a float. */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { fmtBlinds } from '../lib/money';
import type { Entry, Game, GameEvent } from '../lib/types';
import { BlindsControl } from './BlindsControl';
import { EntryLog } from './EntryLog';

const entry: Entry = {
  id: 'e1',
  client_key: null,
  game_id: 'g1',
  user_id: 'u-bob',
  entry_type: 'buy_in',
  amount_minor: 2000,
  state: 'verified',
  created_at: '2026-01-01T20:00:00Z',
  logged_by: 'u-bob',
  verified_by: 'u-alice',
  verified_at: '2026-01-01T20:01:00Z',
  rejection_note: null,
  void_reason: null,
  amends_entry_id: null,
  version: 2,
};

const raise: GameEvent = {
  id: 'ev1',
  game_id: 'g1',
  event_type: 'blinds_changed',
  actor_user_id: 'u-alice',
  created_at: '2026-01-01T20:30:00Z',
  from_small_blind_minor: 10,
  from_big_blind_minor: 20,
  to_small_blind_minor: 25,
  to_big_blind_minor: 50,
};

const game: Game = {
  id: 'g1',
  name: 'Friday',
  join_code: 'ABCDEF',
  state: 'running',
  host_id: 'u-alice',
  currency: 'GBP',
  currency_exponent: 2,
  stake_minor: null,
  small_blind_minor: 25,
  big_blind_minor: 50,
  events: [raise],
  created_at: '2026-01-01T19:00:00Z',
  closed_at: null,
  version: 3,
  members: [
    {
      user_id: 'u-alice',
      display_name: 'Alice',
      is_guest: false,
      can_host: true,
      role: 'host',
      joined_at: '',
      departed_at: null,
      departed_unsettled: false,
    },
    {
      user_id: 'u-bob',
      display_name: 'Bob',
      is_guest: false,
      can_host: true,
      role: 'player',
      joined_at: '',
      departed_at: null,
      departed_unsettled: false,
    },
  ],
  entries: [entry],
  nets: [],
  totals: {
    verified_buy_ins_minor: 2000,
    verified_cash_outs_minor: 0,
    chips_on_table_minor: 2000,
    pending_count: 0,
  },
};

const noop = () => {};

describe('blind changes in the log', () => {
  it('shows the change with who made it, and with no amount', () => {
    render(
      <EntryLog
        game={game}
        meId="u-bob"
        isHost={false}
        onVerify={noop}
        onReject={noop}
        onVoid={noop}
        onAmend={noop}
      />,
    );
    expect(screen.getByText('£0.10/£0.20 → £0.25/£0.50')).toBeInTheDocument();
    expect(screen.getByText('Alice')).toBeInTheDocument();
    // an event is not a claim about money: the amount column is a dash, and
    // the row must never render a currency figure of its own
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('reads the first setting of the blinds as a set, not a change', () => {
    const first: GameEvent = {
      ...raise,
      id: 'ev0',
      from_small_blind_minor: null,
      from_big_blind_minor: null,
    };
    render(
      <EntryLog
        game={{ ...game, entries: [], events: [first] }}
        meId="u-bob"
        isHost={false}
        onVerify={noop}
        onReject={noop}
        onVoid={noop}
        onAmend={noop}
      />,
    );
    expect(screen.getByText('set to £0.25/£0.50')).toBeInTheDocument();
  });
});

describe('BlindsControl', () => {
  it('hands up integer minor units, never a float', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <BlindsControl
        smallMinor={null}
        bigMinor={null}
        currency="GBP"
        exponent={2}
        canEdit
        onChange={onChange}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Set blinds' }));
    await user.type(screen.getByLabelText('small blind'), '0.10');
    await user.type(screen.getByLabelText('big blind'), '0.20');
    await user.click(screen.getByRole('button', { name: 'Set' }));

    expect(onChange).toHaveBeenCalledWith(10, 20);
    const [small, big] = onChange.mock.calls[0];
    expect(Number.isInteger(small)).toBe(true);
    expect(Number.isInteger(big)).toBe(true);
  });

  it('refuses a big blind below the small one rather than sending it', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <BlindsControl
        smallMinor={null}
        bigMinor={null}
        currency="GBP"
        exponent={2}
        canEdit
        onChange={onChange}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Set blinds' }));
    await user.type(screen.getByLabelText('small blind'), '1.00');
    await user.type(screen.getByLabelText('big blind'), '0.50');
    await user.click(screen.getByRole('button', { name: 'Set' }));

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('cannot be smaller');
  });

  it('shows a player the stakes without a way to change them', () => {
    render(
      <BlindsControl
        smallMinor={25}
        bigMinor={50}
        currency="GBP"
        exponent={2}
        canEdit={false}
        onChange={noop}
      />,
    );
    expect(screen.getByText('£0.25/£0.50')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('fmtBlinds', () => {
  it('reads the exponent rather than assuming pence', () => {
    expect(fmtBlinds(100, 200, 'JPY', 0)).toBe('¥100/¥200');
    expect(fmtBlinds(null, null, 'GBP', 2)).toBeNull();
  });
});
