/** Guest sessions render no host controls and no payout fields; a
 * reconciliation mismatch blocks the payment list until acknowledged; the
 * share summary carries names and amounts, never bank details. */

import { fireEvent, render, screen } from '@testing-library/react-native';

import type { Game, PayoutDetailsMasked, Settlement } from '../lib/types';
import { buildShareSummary, SettleView } from './SettleView';

const game: Game = {
  id: 'g1',
  name: 'Tonight',
  join_code: 'ABCD22',
  state: 'settling',
  host_id: 'host-1',
  currency: 'GBP',
  currency_exponent: 2,
  stake_minor: 2000,
  created_at: new Date().toISOString(),
  closed_at: null,
  version: 1,
  members: [
    { user_id: 'host-1', display_name: 'Alice', is_guest: false, role: 'host', joined_at: '', departed_at: null, departed_unsettled: false },
    { user_id: 'guest-1', display_name: 'Charlie', is_guest: true, role: 'player', joined_at: '', departed_at: null, departed_unsettled: false },
  ],
  entries: [],
  nets: [],
  totals: { verified_buy_ins_minor: 4000, verified_cash_outs_minor: 4000, chips_on_table_minor: 0, pending_count: 0 },
};

const balanced: Settlement = {
  final: false,
  computed_at: null,
  payments: [{ from_user: 'guest-1', to_user: 'host-1', amount_minor: 2000, paid: false, paid_at: null }],
  discrepancy_minor: 0,
  acknowledged_by: null,
  needs_acknowledgement: false,
  pending_count: 0,
  nets: {},
};

const hostDetails: PayoutDetailsMasked = {
  user_id: 'host-1',
  display_name: 'Alice',
  account_name: 'A Example',
  bank_name: null,
  sort_code: '040004',
  account_number_masked: '••••5678',
  payment_reference: null,
  revolut_link: 'revolut.me/alice-h',
};

describe('guest view', () => {
  it('renders no payout fields and no close control for a guest', async () => {
    await render(
      <SettleView game={game} settlement={balanced} payoutDetails={null} isHost={false} />,
    );
    expect(screen.queryByTestId('payout-card')).toBeNull();
    expect(screen.queryByTestId('close-game')).toBeNull();
    // absence, not an apology: no "guests can't…" copy anywhere
    expect(screen.queryByText(/guest/i)).toBeNull();
  });

  it('renders the Revolut link in full — a public handle, no mask', async () => {
    await render(
      <SettleView game={game} settlement={balanced} payoutDetails={[hostDetails]} isHost={false} />,
    );
    expect(screen.getAllByText('revolut.me/alice-h').length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText('copy revolut link').length).toBeGreaterThan(0);
  });

  it('renders masked payout details for registered co-players', async () => {
    await render(
      <SettleView game={game} settlement={balanced} payoutDetails={[hostDetails]} isHost={false} />,
    );
    expect(screen.getAllByTestId('payout-card').length).toBeGreaterThan(0);
    expect(screen.getAllByText('••••5678').length).toBeGreaterThan(0);
    expect(screen.queryByText('12345678')).toBeNull();
  });
});

describe('reconciliation gate', () => {
  const mismatch: Settlement = { ...balanced, discrepancy_minor: 1000 };

  it('blocks the payment list until the discrepancy is acknowledged', async () => {
    await render(
      <SettleView game={game} settlement={mismatch} payoutDetails={[hostDetails]} isHost />,
    );
    expect(screen.getByTestId('recon-banner')).toBeTruthy();
    expect(screen.queryByTestId('payments-list')).toBeNull();
    expect(screen.getByTestId('payments-gated')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('acknowledge-toggle'));
    expect(screen.queryByTestId('payments-list')).toBeTruthy();
    expect(screen.queryByTestId('payments-gated')).toBeNull();
  });

  it('never renders a mismatched settlement as if it balances', async () => {
    await render(
      <SettleView game={game} settlement={mismatch} payoutDetails={null} isHost={false} />,
    );
    expect(screen.getByTestId('recon-banner')).toBeTruthy();
  });

  it('a stale settlement is refused outright, not rendered', async () => {
    await render(
      <SettleView game={game} settlement={mismatch} payoutDetails={null} isHost={false} stale />,
    );
    expect(screen.queryByTestId('payments-list')).toBeNull();
    expect(screen.queryByTestId('recon-banner')).toBeNull();
    expect(screen.getByText(/may be stale/i)).toBeTruthy();
  });
});

describe('share summary', () => {
  it('contains names and amounts, never bank details', async () => {
    const summary = buildShareSummary(
      'Tonight',
      { ...balanced, final: true },
      (id) => (id === 'host-1' ? 'Alice' : 'Charlie'),
      'GBP',
      2,
    );
    expect(summary).toContain('Charlie → Alice: £20.00');
    expect(summary).not.toMatch(/040004|5678|sort|account/i);
  });
});
