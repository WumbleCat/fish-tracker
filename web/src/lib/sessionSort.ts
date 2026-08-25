/** Ordering for the sessions list. Pure and total: the component holds the
 * chosen column and direction, this decides what that means. */

import type { GameState, GameSummary, MemberRole } from './types';

export type SortKey = 'name' | 'created_at' | 'currency' | 'state' | 'role';
export type SortDir = 'asc' | 'desc';

export interface Sort {
  key: SortKey;
  dir: SortDir;
}

/** State and role order by what they mean, not how they are spelled. Sorted
 * alphabetically, "abandoned" would lead the list and "closed" would sit
 * between "open" and "running" — an order that tells you nothing about a
 * table's life. Ascending reads draft → abandoned, host before player. */
const STATE_ORDER: readonly GameState[] = [
  'draft',
  'open',
  'running',
  'settling',
  'closed',
  'abandoned',
];
const ROLE_ORDER: readonly MemberRole[] = ['host', 'player'];

/** What the first click on a column should mean. Newest tables first is what
 * someone wants from a date column; names run from A. */
export const INITIAL_DIR: Record<SortKey, SortDir> = {
  name: 'asc',
  created_at: 'desc',
  currency: 'asc',
  state: 'asc',
  role: 'asc',
};

export const DEFAULT_SORT: Sort = { key: 'created_at', dir: 'desc' };

const rank = <T,>(order: readonly T[], value: T): number => {
  const i = order.indexOf(value);
  return i === -1 ? order.length : i; // an unknown value sorts last, never throws
};

const time = (iso: string): number => Date.parse(iso) || 0;

const compare = (key: SortKey, a: GameSummary, b: GameSummary): number => {
  switch (key) {
    case 'name':
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    case 'currency':
      return a.currency.localeCompare(b.currency);
    case 'created_at':
      return time(a.created_at) - time(b.created_at);
    case 'state':
      return rank(STATE_ORDER, a.state) - rank(STATE_ORDER, b.state);
    case 'role':
      return rank(ROLE_ORDER, a.role) - rank(ROLE_ORDER, b.role);
  }
};

export function sortGames(games: readonly GameSummary[], sort: Sort): GameSummary[] {
  const dir = sort.dir === 'asc' ? 1 : -1;
  return [...games].sort((a, b) => {
    const primary = compare(sort.key, a, b);
    if (primary !== 0) return primary * dir;
    // Ties resolve the same way every render — two tables opened the same
    // evening must not swap places on a refetch while someone is reading.
    const byDate = time(b.created_at) - time(a.created_at);
    return byDate !== 0 ? byDate : a.id.localeCompare(b.id);
  });
}

/** Clicking the active column flips it; clicking another starts that column
 * in its own natural direction. */
export function nextSort(current: Sort, key: SortKey): Sort {
  return current.key === key
    ? { key, dir: current.dir === 'asc' ? 'desc' : 'asc' }
    : { key, dir: INITIAL_DIR[key] };
}
