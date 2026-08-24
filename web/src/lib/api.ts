/** Thin typed client for the ledger authority. The API computes; we render.
 * Errors carry the backend's structured codes so callers can branch. */

import type {
  CurrencyHistory,
  Entry,
  Game,
  GameState,
  GameSummary,
  PayoutDetailsMasked,
  Settlement,
  User,
} from './types';

const BASE = import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:8000';

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    public readonly detail: Record<string, unknown>,
  ) {
    super(code);
  }
}

let tokenProvider: () => Promise<string | null> = async () => null;

export function setTokenProvider(provider: () => Promise<string | null>): void {
  tokenProvider = provider;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = await tokenProvider();
  const resp = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!resp.ok) {
    let code = 'request_failed';
    let detail: Record<string, unknown> = {};
    try {
      const parsed = await resp.json();
      code = parsed.error ?? code;
      detail = parsed.detail ?? {};
    } catch {
      // non-JSON failure; keep the generic code
    }
    throw new ApiError(code, resp.status, detail);
  }
  return resp.json() as Promise<T>;
}

export const api = {
  guestJoin: (join_code: string, display_name: string) =>
    request<{ token: string; user_id: string; game_id: string; expires_at: string }>(
      'POST',
      '/api/auth/guest',
      { join_code, display_name },
    ),
  guestRefresh: () =>
    request<{ token: string; user_id: string; game_id: string; expires_at: string }>(
      'POST',
      '/api/auth/guest/refresh',
    ),
  claim: (guest_token: string) => request<User>('POST', '/api/auth/claim', { guest_token }),

  me: () => request<User>('GET', '/api/users/me'),
  updateMe: (patch: { display_name?: string; default_currency?: string }) =>
    request<User>('PATCH', '/api/users/me', patch),
  history: () => request<{ currencies: CurrencyHistory[] }>('GET', '/api/users/me/history'),
  putPayoutDetails: (details: {
    account_name?: string | null;
    sort_code?: string | null;
    account_number?: string | null;
    payment_reference?: string | null;
    revolut_link?: string | null;
  }) => request('PUT', '/api/users/me/payout-details', details),

  games: () => request<GameSummary[]>('GET', '/api/games'),
  game: (id: string) => request<Game>('GET', `/api/games/${id}`),
  createGame: (body: { name: string; currency: string; stake_minor?: number | null }) =>
    request<Game>('POST', '/api/games', body),
  joinGame: (join_code: string) => request<Game>('POST', '/api/games/join', { join_code }),
  changeState: (id: string, to: GameState, if_version?: number) =>
    request<Game>('POST', `/api/games/${id}/state`, { to, if_version }),
  close: (id: string, acknowledge_discrepancy: boolean, if_version?: number) =>
    request<Settlement>('POST', `/api/games/${id}/close`, {
      acknowledge_discrepancy,
      if_version,
    }),
  settlement: (id: string) => request<Settlement>('GET', `/api/games/${id}/settlement`),
  gamePayoutDetails: (id: string) =>
    request<PayoutDetailsMasked[]>('GET', `/api/games/${id}/payout-details`),
  transferHost: (id: string, user_id: string) =>
    request<Game>('POST', `/api/games/${id}/transfer-host`, { user_id }),

  logEntry: (
    gameId: string,
    body: { entry_type: string; amount_minor: number; user_id?: string; client_key: string },
  ) => request<Entry>('POST', `/api/games/${gameId}/entries`, body),
  verify: (entryId: string, if_version?: number) =>
    request<Entry>('POST', `/api/entries/${entryId}/verify`, { if_version }),
  reject: (entryId: string, note?: string, if_version?: number) =>
    request<Entry>('POST', `/api/entries/${entryId}/reject`, { note, if_version }),
  voidEntry: (entryId: string, reason: string, if_version?: number) =>
    request<Entry>('POST', `/api/entries/${entryId}/void`, { reason, if_version }),
  amend: (entryId: string, amount_minor: number, if_version?: number, client_key?: string) =>
    request<Entry>('POST', `/api/entries/${entryId}/amend`, {
      amount_minor,
      if_version,
      client_key,
    }),
};
