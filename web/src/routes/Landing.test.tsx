/** The front door is the front door whether or not you are signed in. A
 * signed-in player joins as themselves — no guest identity is created, and
 * there is no name to type, because they already have one. */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const navigate = vi.fn();
const joinGame = vi.fn();
const guestJoin = vi.fn();
const startGuestSession = vi.fn();
let status: 'signedOut' | 'registered' = 'registered';

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigate };
});
vi.mock('../lib/auth', () => ({
  useAuth: () => ({ status, startGuestSession }),
}));
vi.mock('../lib/api', () => ({
  api: {
    joinGame: (...args: unknown[]) => joinGame(...args),
    guestJoin: (...args: unknown[]) => guestJoin(...args),
  },
  ApiError: class ApiError extends Error {
    code = 'x';
  },
}));
vi.mock('../lib/queries', () => ({
  useMe: () => ({ data: { display_name: 'Ravi' } }),
  useGames: () => ({
    data: [
      { id: 'g1', name: 'Friday at mine', state: 'running' },
      { id: 'g2', name: 'Tuesday', state: 'closed' },
    ],
  }),
}));
vi.mock('../lib/supabase', () => ({ supabase: { auth: {} } }));

const { Landing } = await import('./Landing');

const show = () =>
  render(
    <MemoryRouter>
      <Landing />
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  status = 'registered';
});

describe('the front door, signed in', () => {
  it('joins as the signed-in player, never as a guest', async () => {
    joinGame.mockResolvedValue({ id: 'game-9' });
    const user = userEvent.setup();
    show();

    await user.type(screen.getByLabelText('join code'), 'K7QM42');
    await user.click(screen.getByRole('button', { name: 'Deal me in' }));

    expect(joinGame).toHaveBeenCalledWith('K7QM42');
    expect(guestJoin).not.toHaveBeenCalled();
    expect(startGuestSession).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith('/session/game-9');
  });

  it('asks for no name — they already have one, and says which', () => {
    show();
    expect(screen.queryByLabelText('display name')).not.toBeInTheDocument();
    expect(screen.getByText('Ravi')).toBeInTheDocument();
  });

  it('offers the way back to everything else without leaving the door', () => {
    show();
    expect(screen.getByText('Friday at mine')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'All my sessions' })).toHaveAttribute(
      'href',
      '/sessions',
    );
    // the sign-in card has no business here
    expect(screen.queryByPlaceholderText('Password')).not.toBeInTheDocument();
  });

  it('needs only the code — six characters is the whole form', async () => {
    const user = userEvent.setup();
    show();
    const button = screen.getByRole('button', { name: 'Deal me in' });

    await user.type(screen.getByLabelText('join code'), 'K7QM');
    await user.click(button);
    expect(joinGame).not.toHaveBeenCalled();

    joinGame.mockResolvedValue({ id: 'game-9' });
    await user.type(screen.getByLabelText('join code'), '42');
    await user.click(button);
    expect(joinGame).toHaveBeenCalledOnce();
  });
});

describe('the front door, signed out', () => {
  beforeEach(() => {
    status = 'signedOut';
  });

  it('still takes a name and still joins as a guest', async () => {
    guestJoin.mockResolvedValue({
      token: 't',
      game_id: 'game-3',
      user_id: 'u',
      expires_at: 'later',
    });
    const user = userEvent.setup();
    show();

    await user.type(screen.getByLabelText('join code'), 'K7QM42');
    await user.type(screen.getByLabelText('display name'), 'Dee');
    await user.click(screen.getByRole('button', { name: 'Deal me in' }));

    expect(guestJoin).toHaveBeenCalledWith('K7QM42', 'Dee');
    expect(joinGame).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith('/session/game-3');
  });

  it('keeps the sign-in card for hosts and regulars', () => {
    show();
    expect(screen.getByPlaceholderText('Password')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'All my sessions' })).not.toBeInTheDocument();
  });
});
