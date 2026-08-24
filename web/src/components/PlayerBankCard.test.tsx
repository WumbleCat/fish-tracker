/** The host's paying-out card: one row per field with a copy button, the
 * account number masked, copy working without a reveal. */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import type { PayoutDetailsMasked } from '../lib/types';
import { PlayerBankCard } from './PlayerBankCard';

const details: PayoutDetailsMasked = {
  user_id: 'u-bob',
  display_name: 'Bob',
  account_name: 'R Example',
  sort_code: '123456',
  account_number_masked: '••••4321',
  payment_reference: null,
  revolut_link: null,
};

describe('PlayerBankCard', () => {
  it('renders name, sort code and masked account number, each with a copy button', () => {
    render(<PlayerBankCard details={details} isGbp />);
    expect(screen.getByLabelText('bank details for Bob')).toBeInTheDocument();
    expect(screen.getByText('R Example')).toBeInTheDocument();
    expect(screen.getByText('12-34-56')).toBeInTheDocument();
    expect(screen.getByText('••••4321')).toBeInTheDocument();
    expect(screen.queryByText(/^\d{8}$/)).toBeNull();
    for (const label of ['account name', 'sort code', 'account number']) {
      expect(screen.getByLabelText(`copy ${label}`)).toBeInTheDocument();
    }
  });

  it('copies the sort code without revealing anything', async () => {
    const user = userEvent.setup();
    render(<PlayerBankCard details={details} isGbp />);
    await user.click(screen.getByLabelText('copy sort code'));
    expect(await navigator.clipboard.readText()).toBe('123456');
    expect(screen.getByText('••••4321')).toBeInTheDocument();
  });

  it('shows the free-text reference instead of UK fields for non-GBP games', () => {
    render(
      <PlayerBankCard details={{ ...details, payment_reference: 'IBAN DE89 3704' }} isGbp={false} />,
    );
    expect(screen.queryByText(/sort code/i)).toBeNull();
    expect(screen.getByText('IBAN DE89 3704')).toBeInTheDocument();
  });

  it('renders nothing when the player has shared no details', () => {
    const { container } = render(
      <PlayerBankCard
        details={{
          ...details,
          account_name: null,
          sort_code: null,
          account_number_masked: null,
        }}
        isGbp
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
