/** Handing over the game from a phone. Eligibility is a ledger rule (a guest
 * can never host, including via transfer), and the confirm has to name the
 * person — a mis-tap must not be able to give the game away. */

import { fireEvent, render, screen } from '@testing-library/react-native';

import type { Member } from '../lib/types';
import { HandOverHost, eligibleHosts } from './HandOverHost';

const member = (over: Partial<Member> & { user_id: string; display_name: string }): Member => ({
  is_guest: false,
  can_host: true,
  role: 'player',
  joined_at: '2026-08-28T20:00:00Z',
  departed_at: null,
  departed_unsettled: false,
  ...over,
});

const HOST = member({ user_id: 'u-host', display_name: 'Ravi', role: 'host' });
const PLAYER = member({ user_id: 'u-sam', display_name: 'Sam' });
const GUEST = member({ user_id: 'u-kim', display_name: 'Kim', is_guest: true });
const HOST_ADDED = member({
  user_id: 'u-dave',
  display_name: 'Dave',
  is_guest: true,
  can_host: false,
});
const LEFT = member({ user_id: 'u-jo', display_name: 'Jo', departed_at: '2026-08-28T21:00:00Z' });

const show = async (members: Member[], props: Record<string, unknown> = {}) => {
  const onTransfer = jest.fn();
  const onCancel = jest.fn();
  await render(
    <HandOverHost
      visible
      members={members}
      hostId="u-host"
      onCancel={onCancel}
      onTransfer={onTransfer}
      {...props}
    />,
  );
  return { onTransfer, onCancel };
};

describe('who can be handed the game', () => {
  it('is everyone still seated who can sign in as themselves', () => {
    expect(eligibleHosts([HOST, PLAYER, GUEST, HOST_ADDED, LEFT], 'u-host')).toEqual([
      PLAYER,
      GUEST,
    ]);
  });

  it('lists a guest who joined with the code, not one the host added', async () => {
    await show([HOST, GUEST, HOST_ADDED]);
    expect(screen.getByTestId('host-candidate-u-kim')).toBeTruthy();
    expect(screen.queryByTestId('host-candidate-u-dave')).toBeNull();
  });

  it('says why nobody can take it, with no confirm to press', async () => {
    await show([HOST, HOST_ADDED]);
    expect(screen.getByTestId('no-eligible-host')).toBeTruthy();
    expect(screen.queryByTestId('hand-over-confirm')).toBeNull();
  });
});

describe('handing it over', () => {
  it('needs the player chosen first — the confirm alone does nothing', async () => {
    const { onTransfer } = await show([HOST, PLAYER]);

    await fireEvent.press(screen.getByTestId('hand-over-confirm'));

    expect(onTransfer).not.toHaveBeenCalled();
    expect(screen.getByText('Choose a player')).toBeTruthy();
  });

  it('names the chosen player on the confirm, then transfers to them', async () => {
    const { onTransfer } = await show([HOST, PLAYER]);

    await fireEvent.press(screen.getByTestId('host-candidate-u-sam'));
    expect(screen.getByText('Make Sam the host')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('hand-over-confirm'));
    expect(onTransfer).toHaveBeenCalledWith('u-sam');
  });

  it('does not fire again while the first transfer is in flight', async () => {
    const { onTransfer } = await show([HOST, PLAYER], { pending: true });

    await fireEvent.press(screen.getByTestId('host-candidate-u-sam'));
    await fireEvent.press(screen.getByTestId('hand-over-confirm'));

    expect(onTransfer).not.toHaveBeenCalled();
    expect(screen.getByText('Handing over…')).toBeTruthy();
  });

  it('shows a refusal from the server', async () => {
    await show([HOST, PLAYER], { error: 'Guests can never host — pick a signed-in player.' });
    expect(screen.getByTestId('hand-over-error')).toBeTruthy();
  });

  it('tells the host what they are giving up', async () => {
    await show([HOST, PLAYER]);
    expect(screen.getByText(/no verifying, no closing the game/)).toBeTruthy();
  });
});
