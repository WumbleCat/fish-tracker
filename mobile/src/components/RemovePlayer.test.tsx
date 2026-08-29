/** Taking someone off the table from a phone. Two taps, and the confirm names
 * the person — a mis-tap must not be able to empty a seat. What the host is
 * told matters as much: removal frees a seat, it settles nothing. */

import { fireEvent, render, screen } from '@testing-library/react-native';

import type { Entry, Member } from '../lib/types';
import { RemovePlayer, removableMembers } from './RemovePlayer';

const member = (over: Partial<Member> & { user_id: string; display_name: string }): Member => ({
  is_guest: false,
  can_host: true,
  role: 'player',
  joined_at: '2026-08-29T20:00:00Z',
  departed_at: null,
  departed_unsettled: false,
  ...over,
});

const HOST = member({ user_id: 'u-host', display_name: 'Ravi', role: 'host' });
const PLAYER = member({ user_id: 'u-sam', display_name: 'Sam' });
// seated by the host: no credential, but a seat like anyone else's
const HOST_ADDED = member({
  user_id: 'u-dave',
  display_name: 'Dave',
  is_guest: true,
  can_host: false,
});
const LEFT = member({ user_id: 'u-jo', display_name: 'Jo', departed_at: '2026-08-29T21:00:00Z' });

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
    verified_by: state === 'verified' ? 'u-host' : null,
    verified_at: state === 'verified' ? new Date().toISOString() : null,
    rejection_note: null,
    void_reason: null,
    amends_entry_id: null,
    client_key: null,
    version: 1,
  };
}

const show = async (
  members: Member[],
  entries: Entry[] = [],
  props: Record<string, unknown> = {},
) => {
  const onRemove = jest.fn();
  const onCancel = jest.fn();
  await render(
    <RemovePlayer
      visible
      members={members}
      hostId="u-host"
      entries={entries}
      onCancel={onCancel}
      onRemove={onRemove}
      {...props}
    />,
  );
  return { onRemove, onCancel };
};

describe('who can be removed', () => {
  it('is everyone still seated except the host', () => {
    expect(removableMembers([HOST, PLAYER, HOST_ADDED, LEFT], 'u-host')).toEqual([
      PLAYER,
      HOST_ADDED,
    ]);
  });

  it('offers no way to remove yourself while you hold the game', async () => {
    await show([HOST, PLAYER]);
    expect(screen.queryByTestId('remove-candidate-u-host')).toBeNull();
  });

  it('says so plainly when there is nobody to remove', async () => {
    await show([HOST]);
    expect(screen.getByTestId('nobody-to-remove')).toBeTruthy();
    expect(screen.queryByTestId('remove-confirm')).toBeNull();
  });
});

describe('the confirm', () => {
  it('does nothing until somebody is chosen', async () => {
    const { onRemove } = await show([HOST, PLAYER]);

    await fireEvent.press(screen.getByTestId('remove-confirm'));

    expect(onRemove).not.toHaveBeenCalled();
    expect(screen.getByText('Choose a player')).toBeTruthy();
  });

  it('names the person before it will do anything', async () => {
    const { onRemove } = await show([HOST, PLAYER]);

    await fireEvent.press(screen.getByTestId('remove-candidate-u-sam'));
    expect(screen.getByText('Remove Sam')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('remove-confirm'));

    expect(onRemove).toHaveBeenCalledWith('u-sam');
  });

  it('is inert while a removal is already in flight', async () => {
    const { onRemove } = await show([HOST, PLAYER], [], { pending: true });

    await fireEvent.press(screen.getByTestId('remove-candidate-u-sam'));
    await fireEvent.press(screen.getByTestId('remove-confirm'));

    expect(onRemove).not.toHaveBeenCalled();
  });
});

describe('what the host is told about the person they chose', () => {
  it('warns that somebody mid-hand leaves unsettled', async () => {
    await show([HOST, PLAYER], [entry('u-sam', 'buy_in', 5000)]);

    await fireEvent.press(screen.getByTestId('remove-candidate-u-sam'));

    expect(screen.getByTestId('remove-consequence').props.children).toMatch(/left unsettled/);
  });

  it('says a pending claim survives the removal, because it does', async () => {
    await show([HOST, PLAYER], [entry('u-sam', 'buy_in', 5000, 'pending')]);

    await fireEvent.press(screen.getByTestId('remove-candidate-u-sam'));

    expect(screen.getByTestId('remove-consequence').props.children).toMatch(
      /won’t close until you do/,
    );
  });

  it('warns about nothing once their position is closed out', async () => {
    await show(
      [HOST, PLAYER],
      [entry('u-sam', 'buy_in', 5000), entry('u-sam', 'cash_out', 5000)],
    );

    await fireEvent.press(screen.getByTestId('remove-candidate-u-sam'));

    expect(screen.queryByTestId('remove-consequence')).toBeNull();
  });

  it('warns about nobody before a person is chosen', async () => {
    await show([HOST, PLAYER], [entry('u-sam', 'buy_in', 5000)]);

    expect(screen.queryByTestId('remove-consequence')).toBeNull();
  });
});
