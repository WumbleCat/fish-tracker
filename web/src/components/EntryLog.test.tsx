/** An in-flight action is an overlay on the row: it reads "verifying…"
 * while its state — and therefore every figure derived from it — stays
 * what the server last said. */

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { Entry, Game } from '../lib/types';
import { EntryLog } from './EntryLog';

const entry: Entry = {
  id: 'e1',
  client_key: null,
  game_id: 'g1',
  user_id: 'u-bob',
  entry_type: 'buy_in',
  amount_minor: 2000,
  state: 'pending',
  created_at: '2026-01-01T20:00:00Z',
  logged_by: 'u-bob',
  verified_by: null,
  verified_at: null,
  rejection_note: null,
  void_reason: null,
  amends_entry_id: null,
  version: 1,
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
  small_blind_minor: null,
  big_blind_minor: null,
  events: [],
  created_at: '2026-01-01T19:00:00Z',
  closed_at: null,
  version: 1,
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
    verified_buy_ins_minor: 0,
    verified_cash_outs_minor: 0,
    chips_on_table_minor: 2000,
    pending_count: 1,
  },
};

const noop = () => {};

describe('EntryLog in-flight overlay', () => {
  it('shows "verifying…" beside the unchanged pending state and hides the row actions', () => {
    render(
      <EntryLog
        game={game}
        meId="u-alice"
        isHost
        inflight={{ e1: 'verify' }}
        onVerify={noop}
        onReject={noop}
        onVoid={noop}
        onAmend={noop}
      />,
    );
    expect(screen.getByText('pending')).toBeInTheDocument();
    expect(screen.queryByText('verified')).toBeNull();
    expect(screen.getByText('verifying…')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^verify$/i })).toBeNull();
  });

  it('renders a confirmed row with no overlay and its actions available on hover', () => {
    render(
      <EntryLog
        game={game}
        meId="u-alice"
        isHost
        onVerify={noop}
        onReject={noop}
        onVoid={noop}
        onAmend={noop}
      />,
    );
    expect(screen.queryByText(/…$/)).toBeNull();
    expect(screen.getByRole('button', { name: /^verify$/i })).toBeInTheDocument();
  });
});
