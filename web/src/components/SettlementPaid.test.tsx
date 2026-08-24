/** The host's paid tick: a checkbox for the host, a "paid" pill for
 * everyone else, a paid n/m counter — and never a change to the payments. */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { Game, Payment, Settlement } from '../lib/types';
import { SettlementPanel } from './SettlementPanel';

const member = (user_id: string, display_name: string, role: 'host' | 'player') => ({
  user_id,
  display_name,
  is_guest: false,
  role,
  joined_at: '',
  departed_at: null,
  departed_unsettled: false,
});

const game: Game = {
  id: 'g1',
  name: 'Friday',
  join_code: 'ABCDEF',
  state: 'settling',
  host_id: 'alice',
  currency: 'GBP',
  currency_exponent: 2,
  stake_minor: null,
  created_at: '',
  closed_at: null,
  version: 3,
  members: [member('alice', 'Alice', 'host'), member('bob', 'Bob', 'player')],
  entries: [],
  nets: [],
  totals: { verified_buy_ins_minor: 4000, verified_cash_outs_minor: 4000, chips_on_table_minor: 0, pending_count: 0 },
};

const payment: Payment = { from_user: 'bob', to_user: 'alice', amount_minor: 2000, paid: false, paid_at: null };
const settlement: Settlement = {
  final: false,
  computed_at: null,
  payments: [payment],
  discrepancy_minor: 0,
  acknowledged_by: null,
  needs_acknowledgement: false,
  pending_count: 0,
  nets: { alice: 2000, bob: -2000 },
};

describe('paid marks', () => {
  it('the host ticks a payment and the mark is reported, not applied to the amounts', async () => {
    const user = userEvent.setup();
    const onMarkPaid = vi.fn();
    render(
      <SettlementPanel game={game} settlement={settlement} payoutDetails={null} isHost onMarkPaid={onMarkPaid} />,
    );
    expect(screen.getByTestId('settle-paid')).toHaveTextContent('0/1');
    await user.click(screen.getByLabelText('paid: Bob to Alice'));
    expect(onMarkPaid).toHaveBeenCalledWith(payment, true);
    expect(screen.getByText('£20.00')).toBeInTheDocument(); // the amount is untouched
  });

  it('a player sees a paid pill, never a checkbox', () => {
    render(
      <SettlementPanel
        game={game}
        settlement={{ ...settlement, payments: [{ ...payment, paid: true, paid_at: '2026-08-24T22:00:00Z' }] }}
        payoutDetails={null}
        isHost={false}
      />,
    );
    expect(screen.getByText('paid')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.getByTestId('settle-paid')).toHaveTextContent('1/1');
  });
});
