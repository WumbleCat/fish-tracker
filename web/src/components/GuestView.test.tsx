/** A guest session renders no host controls and no payout fields — limits
 * appear as absence, never as disabled controls or error text. */

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { Entry, Game, Settlement } from '../lib/types';
import { EntryLog } from './EntryLog';
import { SettlementPanel } from './SettlementPanel';

function entry(id: string, state: Entry['state']): Entry {
  return {
    id,
    game_id: 'g1',
    user_id: 'guest-1',
    entry_type: 'buy_in',
    amount_minor: 2000,
    state,
    created_at: new Date().toISOString(),
    logged_by: 'guest-1',
    verified_by: null,
    verified_at: null,
    rejection_note: null,
    void_reason: null,
    amends_entry_id: null,
    client_key: null,
    version: 1,
  };
}

const game: Game = {
  id: 'g1',
  name: 'Tonight',
  join_code: 'ABCD22',
  state: 'settling',
  host_id: 'host-1',
  currency: 'GBP',
  currency_exponent: 2,
  stake_minor: null,
  created_at: new Date().toISOString(),
  closed_at: null,
  version: 1,
  members: [
    {
      user_id: 'host-1',
      display_name: 'Alice',
      is_guest: false,
      role: 'host',
      joined_at: '',
      departed_at: null,
      departed_unsettled: false,
    },
    {
      user_id: 'guest-1',
      display_name: 'Charlie',
      is_guest: true,
      role: 'player',
      joined_at: '',
      departed_at: null,
      departed_unsettled: false,
    },
  ],
  entries: [entry('e1', 'pending'), entry('e2', 'verified')],
  nets: [],
  totals: {
    verified_buy_ins_minor: 2000,
    verified_cash_outs_minor: 0,
    chips_on_table_minor: 4000,
    pending_count: 1,
  },
};

const settlement: Settlement = {
  final: false,
  computed_at: null,
  payments: [{ from_user: 'guest-1', to_user: 'host-1', amount_minor: 2000, paid: false, paid_at: null }],
  discrepancy_minor: 0,
  acknowledged_by: null,
  needs_acknowledgement: false,
  pending_count: 0,
  nets: {},
};

describe('guest view', () => {
  it('the entry log shows no verify, reject or void controls for a guest', () => {
    render(
      <EntryLog
        game={game}
        meId="guest-1"
        isHost={false}
        onVerify={() => {}}
        onReject={() => {}}
        onVoid={() => {}}
        onAmend={() => {}}
      />,
    );
    expect(screen.queryByRole('button', { name: /verify/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /reject/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /void/i })).toBeNull();
  });

  it('the settlement panel renders payments but no payout fields and no close button', () => {
    render(
      <SettlementPanel
        game={game}
        settlement={settlement}
        payoutDetails={null} /* the API refuses guests; nothing arrives */
        isHost={false}
      />,
    );
    expect(screen.getByLabelText('payments')).toBeInTheDocument();
    expect(screen.queryByLabelText('payout details')).toBeNull();
    expect(screen.queryByText(/sort code/i)).toBeNull();
    expect(screen.queryByText(/account number/i)).toBeNull();
    expect(screen.queryByRole('button', { name: /close game/i })).toBeNull();
    // and no apologetic placeholder implying something is missing
    expect(screen.queryByText(/guests can/i)).toBeNull();
  });
});
