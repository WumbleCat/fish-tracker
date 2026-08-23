/** The keyboard contract: three consecutive buy-ins, no mouse. */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import type { Member } from '../lib/types';
import { EntryForm, type EntryDraft } from './EntryForm';

const members: Member[] = [
  {
    user_id: 'u-alice',
    display_name: 'Alice',
    is_guest: false,
    role: 'host',
    joined_at: '',
    departed_at: null,
    departed_unsettled: false,
  },
  {
    user_id: 'u-bob',
    display_name: 'Bob',
    is_guest: false,
    role: 'player',
    joined_at: '',
    departed_at: null,
    departed_unsettled: false,
  },
  {
    user_id: 'u-carol',
    display_name: 'Carol',
    is_guest: true,
    role: 'player',
    joined_at: '',
    departed_at: null,
    departed_unsettled: false,
  },
];

describe('EntryForm keyboard flow', () => {
  it('logs three consecutive buy-ins without touching the mouse', async () => {
    const submitted: EntryDraft[] = [];
    const user = userEvent.setup();
    render(
      <EntryForm
        members={members}
        currency="GBP"
        exponent={2}
        canPickPlayer
        onSubmit={(draft) => {
          submitted.push(draft);
        }}
      />,
    );

    // focus starts on the player select; everything below is keys only —
    // Tab to the amount, type, Enter submits and refocuses the first field
    await user.keyboard('{Tab}{Tab}50{Enter}');
    await user.keyboard('{Tab}{Tab}20{Enter}');
    await user.keyboard('{Tab}{Tab}30{Enter}');

    expect(submitted).toEqual([
      { userId: 'u-alice', entryType: 'buy_in', amountMinor: 5000 },
      { userId: 'u-alice', entryType: 'buy_in', amountMinor: 2000 },
      { userId: 'u-alice', entryType: 'buy_in', amountMinor: 3000 },
    ]);
  });

  it('rejects a bad amount, keeps the typed input, and reports the rule', async () => {
    const submitted: EntryDraft[] = [];
    const user = userEvent.setup();
    render(
      <EntryForm
        members={members}
        currency="GBP"
        exponent={2}
        canPickPlayer
        onSubmit={(draft) => {
          submitted.push(draft);
        }}
      />,
    );
    await user.keyboard('{Tab}{Tab}12.345{Enter}');
    expect(submitted).toHaveLength(0);
    expect(screen.getByRole('alert')).toHaveTextContent(/positive amount/i);
    expect(screen.getByLabelText('amount')).toHaveValue('12.345');
  });

  it('keeps the form contents when the save fails, for retry', async () => {
    const user = userEvent.setup();
    render(
      <EntryForm
        members={members}
        currency="GBP"
        exponent={2}
        canPickPlayer
        onSubmit={() => Promise.reject(new Error('network down'))}
      />,
    );
    await user.keyboard('{Tab}{Tab}50{Enter}');
    expect(await screen.findByRole('alert')).toHaveTextContent('network down');
    expect(screen.getByLabelText('amount')).toHaveValue('50');
  });
});
