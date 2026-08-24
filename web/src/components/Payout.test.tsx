/** Bank details render masked; the group-chat summary carries names and
 * amounts, never bank details. */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { settlementSummary } from '../lib/clipboard';
import type { PayoutDetailsMasked } from '../lib/types';
import { PayoutBlock } from './PayoutBlock';

const details: PayoutDetailsMasked = {
  user_id: 'host-1',
  display_name: 'Alice',
  account_name: 'A Example',
  sort_code: '040004',
  account_number_masked: '••••5678',
  payment_reference: null,
  revolut_link: 'revolut.me/alice-h',
};

describe('PayoutBlock', () => {
  it('renders the account number masked by default', () => {
    render(<PayoutBlock details={details} isGbp title="Pay the host" />);
    expect(screen.getByText('••••5678')).toBeInTheDocument();
    expect(screen.queryByText(/^\d{8}$/)).toBeNull();
    expect(screen.getByLabelText('reveal account number')).toBeInTheDocument();
  });

  it('renders the Revolut link in full — a public handle needs no mask', () => {
    render(<PayoutBlock details={details} isGbp />);
    const link = screen.getByRole('link', { name: /revolut\.me\/alice-h/i });
    expect(link).toHaveAttribute('href', 'https://revolut.me/alice-h');
    expect(screen.getByLabelText('copy revolut link')).toBeInTheDocument();
  });

  it('shows the free-text reference instead of UK fields for non-GBP games', () => {
    render(
      <PayoutBlock
        details={{ ...details, payment_reference: 'IBAN DE89 3704 0044 0532 0130 00' }}
        isGbp={false}
      />,
    );
    expect(screen.queryByText(/sort code/i)).toBeNull();
    expect(screen.getByText(/IBAN DE89/)).toBeInTheDocument();
  });
});

describe('settlement clipboard summary', () => {
  const summary = settlementSummary(
    "Friday at Alice's",
    [
      { from_user: 'u-bob', to_user: 'u-alice', amount_minor: 6000 },
      { from_user: 'u-carol', to_user: 'u-alice', amount_minor: 1500 },
    ],
    (id) => ({ 'u-bob': 'Bob', 'u-carol': 'Carol', 'u-alice': 'Alice' })[id] ?? id,
    'GBP',
    2,
    0,
  );

  it('contains names and amounts', () => {
    expect(summary).toContain('Bob → Alice: £60.00');
    expect(summary).toContain('Carol → Alice: £15.00');
  });

  it('contains no bank details — by construction it never receives them', () => {
    expect(summary).not.toMatch(/\b\d{6}\b/); // sort code shapes
    expect(summary).not.toMatch(/\b\d{8}\b/); // account number shapes
    expect(summary).not.toMatch(/sort code|account/i);
  });

  it('records an acknowledged discrepancy as a note', () => {
    const withGap = settlementSummary('G', [], () => 'x', 'GBP', 2, 1000);
    expect(withGap).toContain('£10.00');
    expect(withGap).toContain('short');
  });

  it('copy on the payout block copies without revealing', async () => {
    const user = userEvent.setup();
    render(<PayoutBlock details={details} isGbp />);
    await user.click(screen.getByLabelText('copy sort code'));
    expect(await navigator.clipboard.readText()).toBe('040004');
    // still masked on screen
    expect(screen.getByText('••••5678')).toBeInTheDocument();
  });
});
