/** What the host is told before taking somebody off the table.
 *
 * "Remove" is the wrong word for what actually happens, so the dialog's job
 * is to correct it: nothing is deleted, the net still settles, and an
 * unresolved position is still the host's problem afterwards. */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ApiError } from '../lib/api';
import type { Entry, Member } from '../lib/types';
import { RemovePlayer, isRemovable, removePlayerErrorMessage } from './RemovePlayer';

const member = (over: Partial<Member> & { user_id: string; display_name: string }): Member => ({
  is_guest: false,
  can_host: true,
  role: 'player',
  joined_at: '',
  departed_at: null,
  departed_unsettled: false,
  ...over,
});

const SAM = member({ user_id: 'u-sam', display_name: 'Sam' });

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

function open(entries: Entry[] = [], onRemove = vi.fn().mockResolvedValue(undefined)) {
  render(
    <RemovePlayer
      open
      onOpenChange={() => {}}
      member={SAM}
      entries={entries}
      onRemove={onRemove}
    />,
  );
  return onRemove;
}

describe('isRemovable', () => {
  it('is anyone still seated except the host', () => {
    const host = member({ user_id: 'u-host', display_name: 'Alice', role: 'host' });
    const left = member({
      user_id: 'u-jo',
      display_name: 'Jo',
      departed_at: '2026-08-29T21:00:00Z',
    });

    expect(isRemovable(SAM, 'u-host')).toBe(true);
    expect(isRemovable(host, 'u-host')).toBe(false); // hand the game over instead
    expect(isRemovable(left, 'u-host')).toBe(false); // no seat left to take
  });
});

describe('the remove dialog', () => {
  it('names the person and says their money stays in the ledger', () => {
    open();

    expect(screen.getByRole('heading', { name: /Remove Sam\?/ })).toBeTruthy();
    expect(screen.getByText(/stays in the ledger/)).toBeTruthy();
    expect(screen.getByText(/still counts toward settlement/)).toBeTruthy();
  });

  it('warns that somebody mid-hand leaves unsettled', () => {
    open([entry('u-sam', 'buy_in', 5000)]);

    expect(screen.getByText(/left unsettled/)).toBeTruthy();
  });

  it('says a pending claim survives the removal, because it does', () => {
    open([entry('u-sam', 'buy_in', 5000, 'pending')]);

    expect(screen.getByText(/won’t close until you do/)).toBeTruthy();
  });

  it('warns about nothing when their position is closed out', () => {
    open([entry('u-sam', 'buy_in', 5000), entry('u-sam', 'cash_out', 5000)]);

    expect(screen.queryByText(/left unsettled/)).toBeNull();
    expect(screen.queryByText(/won’t close until you do/)).toBeNull();
  });

  it('removes only on the button that names them', async () => {
    const onRemove = open();

    await userEvent.click(screen.getByRole('button', { name: 'Remove Sam' }));

    expect(onRemove).toHaveBeenCalledWith('u-sam');
  });

  it('keeps the dialog up and says what happened when the server refuses', async () => {
    const onRemove = vi
      .fn()
      .mockRejectedValue(new ApiError('version_conflict', 409, {}));
    open([], onRemove);

    await userEvent.click(screen.getByRole('button', { name: 'Remove Sam' }));

    expect(screen.getByRole('alert').textContent).toMatch(/table changed/i);
  });
});

describe('removePlayerErrorMessage', () => {
  it('sends a host who tried to remove themselves to the handover', () => {
    const message = removePlayerErrorMessage(
      new ApiError('host_must_transfer_first', 409, {}),
    );
    expect(message).toMatch(/hand it over first/i);
  });

  it('explains a finished game rather than blaming the click', () => {
    expect(removePlayerErrorMessage(new ApiError('game_closed', 409, {}))).toMatch(
      /doesn’t change any more/,
    );
  });

  it('has something to say about a failure it has never seen', () => {
    expect(removePlayerErrorMessage(new Error('offline'))).toMatch(/try again/i);
  });
});
