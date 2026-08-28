/** Creating a game is the one write on this screen, and a failure used to be
 * invisible: the request 500'd, the dialog sat there, and the button read as
 * broken. It now says so, and it cannot fire twice. */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const navigate = vi.fn();
const createGame = vi.fn();
const changeState = vi.fn();
const game = {
  id: 'g1',
  name: 'Friday at mine',
  state: 'running',
  currency: 'GBP',
  created_at: '2026-08-01T00:00:00Z',
  role: 'host',
};
let games: unknown[] = [game];

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigate };
});
vi.mock('../lib/api', () => ({
  api: {
    createGame: (...a: unknown[]) => createGame(...a),
    changeState: (...a: unknown[]) => changeState(...a),
    joinGame: vi.fn(),
  },
  ApiError: class ApiError extends Error {
    constructor(
      public code: string,
      public status: number,
      public detail: Record<string, unknown> = {},
    ) {
      super(code);
    }
  },
}));
vi.mock('../lib/queries', () => ({
  useMe: () => ({ data: { display_name: 'Ravi', default_currency: 'GBP' } }),
  useGames: () => ({ data: games }),
  prefetchGame: vi.fn(),
}));
vi.mock('../lib/supabase', () => ({ supabase: { auth: {} } }));

const { Sessions } = await import('./Sessions');
const { ApiError } = await import('../lib/api');
const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');

const show = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>
      <MemoryRouter>
        <Sessions />
      </MemoryRouter>
    </QueryClientProvider>,
  );

const openDialog = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('button', { name: /new game/i }));
  return screen.getByPlaceholderText(/e\.g\. Friday at/i);
};

beforeEach(() => {
  vi.clearAllMocks();
  games = [game];
});

describe('creating a game', () => {
  it('creates and opens the new session', async () => {
    createGame.mockResolvedValue({ id: 'new-1', version: 1 });
    const user = userEvent.setup();
    show();
    await user.type(await openDialog(user), 'Poker night');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    expect(createGame).toHaveBeenCalledWith({ name: 'Poker night', currency: 'GBP' });
    expect(navigate).toHaveBeenCalledWith('/session/new-1');
  });

  it('says the create failed instead of doing nothing, and keeps the name', async () => {
    createGame.mockRejectedValue(new ApiError('request_failed', 500, {}));
    const user = userEvent.setup();
    show();
    const field = await openDialog(user);
    await user.type(field, 'Poker night');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not create the game/i);
    expect(field).toHaveValue('Poker night');
  });

  it('will not create the same game twice from two clicks', async () => {
    let release: (g: unknown) => void = () => {};
    createGame.mockReturnValue(new Promise((resolve) => (release = resolve)));
    const user = userEvent.setup();
    show();
    await user.type(await openDialog(user), 'Poker night');
    const submit = screen.getByRole('button', { name: 'Create' });
    await user.click(submit);
    await user.click(screen.getByRole('button', { name: /creating/i }));

    expect(createGame).toHaveBeenCalledTimes(1);
    release({ id: 'new-1', version: 1 });
  });

  it('opens the first table for a host with no games', async () => {
    games = [];
    createGame.mockResolvedValue({ id: 'new-2', version: 1 });
    changeState.mockResolvedValue({ id: 'new-2', version: 2 });
    const user = userEvent.setup();
    show();
    await user.type(screen.getByLabelText('game name'), 'Poker night');
    await user.click(screen.getByRole('button', { name: /open the table/i }));

    expect(changeState).toHaveBeenCalledWith('new-2', 'open', 1);
    expect(navigate).toHaveBeenCalledWith('/session/new-2');
  });
});
