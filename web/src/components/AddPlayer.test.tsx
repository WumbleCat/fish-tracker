/** Seating a player the host typed a name for: the one write on this dialog,
 * and a refusal has to read as a refusal — a full table is a normal thing to
 * be told, not a button that stops working. */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '../lib/api';
import { AddPlayer } from './AddPlayer';

const onAdd = vi.fn();
const onOpenChange = vi.fn();

const show = () =>
  render(<AddPlayer open onOpenChange={onOpenChange} onAdd={onAdd} />);

beforeEach(() => vi.clearAllMocks());

describe('adding a player', () => {
  it('seats the typed name and closes', async () => {
    onAdd.mockResolvedValue(undefined);
    const user = userEvent.setup();
    show();

    await user.type(screen.getByLabelText('player name'), '  Dave  ');
    await user.click(screen.getByRole('button', { name: 'Seat them' }));

    expect(onAdd).toHaveBeenCalledWith('Dave');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('says a full table is full, and keeps the name for the retry', async () => {
    onAdd.mockRejectedValue(new ApiError('table_full', 409, { seats: 11 }));
    const user = userEvent.setup();
    show();

    const field = screen.getByLabelText('player name');
    await user.type(field, 'Dave');
    await user.click(screen.getByRole('button', { name: 'Seat them' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'That table is full — 11 seats, all taken.',
    );
    expect(field).toHaveValue('Dave');
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('names the host-only refusal rather than a generic failure', async () => {
    onAdd.mockRejectedValue(new ApiError('not_host', 403, {}));
    const user = userEvent.setup();
    show();

    await user.type(screen.getByLabelText('player name'), 'Dave');
    await user.click(screen.getByRole('button', { name: 'Seat them' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Only the host can seat a player.');
  });

  it('will not seat the same player twice from two clicks', async () => {
    let release: () => void = () => {};
    onAdd.mockReturnValue(new Promise<void>((resolve) => (release = resolve)));
    const user = userEvent.setup();
    show();

    await user.type(screen.getByLabelText('player name'), 'Dave');
    await user.click(screen.getByRole('button', { name: 'Seat them' }));
    await user.click(screen.getByRole('button', { name: 'Seating…' }));

    expect(onAdd).toHaveBeenCalledTimes(1);
    release();
  });

  it('refuses a name that is only whitespace', async () => {
    const user = userEvent.setup();
    show();

    await user.type(screen.getByLabelText('player name'), '   ');
    await user.click(screen.getByRole('button', { name: 'Seat them' }));

    expect(onAdd).not.toHaveBeenCalled();
  });
});
