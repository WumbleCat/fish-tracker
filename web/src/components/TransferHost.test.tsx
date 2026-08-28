/** Who may be handed the game, and what the host is told before handing it
 * over. Eligibility is a rule, not a filter for tidiness: a guest can never
 * host, including via transfer, and the ledger depends on it. */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '../lib/api';
import type { Member } from '../lib/types';
import { TransferHost, eligibleHosts } from './TransferHost';

const member = (over: Partial<Member> & { user_id: string; display_name: string }): Member => ({
  is_guest: false,
  role: 'player',
  joined_at: '2026-08-28T20:00:00Z',
  departed_at: null,
  departed_unsettled: false,
  ...over,
});

const HOST = member({ user_id: 'u-host', display_name: 'Ravi', role: 'host' });
const PLAYER = member({ user_id: 'u-sam', display_name: 'Sam' });
const GUEST = member({ user_id: 'u-dave', display_name: 'Dave', is_guest: true });
const LEFT = member({
  user_id: 'u-jo',
  display_name: 'Jo',
  departed_at: '2026-08-28T21:00:00Z',
});

const onTransfer = vi.fn();
const onOpenChange = vi.fn();

const show = (members: Member[]) =>
  render(
    <TransferHost
      open
      onOpenChange={onOpenChange}
      members={members}
      hostId="u-host"
      onTransfer={onTransfer}
    />,
  );

beforeEach(() => vi.clearAllMocks());

describe('who can be handed the game', () => {
  it('offers registered players who are still at the table', () => {
    expect(eligibleHosts([HOST, PLAYER, GUEST, LEFT], 'u-host')).toEqual([PLAYER]);
  });

  it('never offers a guest, however long they have played', () => {
    show([HOST, PLAYER, GUEST]);
    expect(screen.getByLabelText('Sam')).toBeInTheDocument();
    expect(screen.queryByLabelText('Dave')).not.toBeInTheDocument();
  });

  it('says why nobody is eligible rather than showing an empty list', () => {
    show([HOST, GUEST]);
    expect(screen.getByText(/Only signed-in players can host/)).toBeInTheDocument();
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
  });
});

describe('handing it over', () => {
  it('names the person on the button before it is pressed', async () => {
    const user = userEvent.setup();
    show([HOST, PLAYER]);

    expect(screen.getByRole('button', { name: 'Choose a player' })).toBeDisabled();
    await user.click(screen.getByLabelText('Sam'));

    expect(screen.getByRole('button', { name: 'Make Sam the host' })).toBeEnabled();
  });

  it('transfers to the chosen player and closes', async () => {
    onTransfer.mockResolvedValue(undefined);
    const user = userEvent.setup();
    show([HOST, PLAYER]);

    await user.click(screen.getByLabelText('Sam'));
    await user.click(screen.getByRole('button', { name: 'Make Sam the host' }));

    expect(onTransfer).toHaveBeenCalledWith('u-sam');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('keeps the dialog open and says what happened when the API refuses', async () => {
    onTransfer.mockRejectedValue(new ApiError('version_conflict', 409, {}));
    const user = userEvent.setup();
    show([HOST, PLAYER]);

    await user.click(screen.getByLabelText('Sam'));
    await user.click(screen.getByRole('button', { name: 'Make Sam the host' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/game changed while this was open/i);
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('hands the game over once, not twice, from two clicks', async () => {
    let release: () => void = () => {};
    onTransfer.mockReturnValue(new Promise<void>((resolve) => (release = resolve)));
    const user = userEvent.setup();
    show([HOST, PLAYER]);

    await user.click(screen.getByLabelText('Sam'));
    await user.click(screen.getByRole('button', { name: 'Make Sam the host' }));
    await user.click(screen.getByRole('button', { name: 'Handing over…' }));

    expect(onTransfer).toHaveBeenCalledTimes(1);
    release();
  });

  it('tells the host what they are giving up', () => {
    show([HOST, PLAYER]);
    expect(screen.getByText(/no verifying, no closing the game/i)).toBeInTheDocument();
  });
});
