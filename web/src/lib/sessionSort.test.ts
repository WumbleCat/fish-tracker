import { describe, expect, it } from 'vitest';

import { DEFAULT_SORT, nextSort, sortGames } from './sessionSort';
import type { GameSummary } from './types';

const game = (over: Partial<GameSummary>): GameSummary => ({
  id: 'id-0',
  name: 'Table',
  state: 'running',
  currency: 'GBP',
  currency_exponent: 2,
  created_at: '2026-08-01T20:00:00Z',
  closed_at: null,
  role: 'player',
  ...over,
});

const names = (games: GameSummary[]) => games.map((g) => g.name);

describe('sortGames', () => {
  const spread = [
    game({ id: 'a', name: 'Zoo', created_at: '2026-08-03T20:00:00Z' }),
    game({ id: 'b', name: 'anvil', created_at: '2026-08-01T20:00:00Z' }),
    game({ id: 'c', name: 'Midweek', created_at: '2026-08-02T20:00:00Z' }),
  ];

  it('sorts names case-insensitively in both directions', () => {
    expect(names(sortGames(spread, { key: 'name', dir: 'asc' }))).toEqual([
      'anvil',
      'Midweek',
      'Zoo',
    ]);
    expect(names(sortGames(spread, { key: 'name', dir: 'desc' }))).toEqual([
      'Zoo',
      'Midweek',
      'anvil',
    ]);
  });

  it('sorts dates oldest-first ascending and newest-first descending', () => {
    expect(names(sortGames(spread, { key: 'created_at', dir: 'asc' }))).toEqual([
      'anvil',
      'Midweek',
      'Zoo',
    ]);
    expect(names(sortGames(spread, { key: 'created_at', dir: 'desc' }))).toEqual([
      'Zoo',
      'Midweek',
      'anvil',
    ]);
  });

  it('sorts currency codes alphabetically', () => {
    const mixed = [
      game({ id: 'a', name: 'usd', currency: 'USD' }),
      game({ id: 'b', name: 'eur', currency: 'EUR' }),
      game({ id: 'c', name: 'gbp', currency: 'GBP' }),
    ];
    expect(names(sortGames(mixed, { key: 'currency', dir: 'asc' }))).toEqual([
      'eur',
      'gbp',
      'usd',
    ]);
    expect(names(sortGames(mixed, { key: 'currency', dir: 'desc' }))).toEqual([
      'usd',
      'gbp',
      'eur',
    ]);
  });

  it('orders states by lifecycle, not alphabetically', () => {
    const states = [
      game({ id: 'a', name: 'closed', state: 'closed' }),
      game({ id: 'b', name: 'abandoned', state: 'abandoned' }),
      game({ id: 'c', name: 'draft', state: 'draft' }),
      game({ id: 'd', name: 'running', state: 'running' }),
    ];
    expect(names(sortGames(states, { key: 'state', dir: 'asc' }))).toEqual([
      'draft',
      'running',
      'closed',
      'abandoned',
    ]);
    expect(names(sortGames(states, { key: 'state', dir: 'desc' }))).toEqual([
      'abandoned',
      'closed',
      'running',
      'draft',
    ]);
  });

  it('puts the tables you hosted first when sorting by role ascending', () => {
    const roles = [
      game({ id: 'a', name: 'sat at', role: 'player' }),
      game({ id: 'b', name: 'hosted', role: 'host' }),
    ];
    expect(names(sortGames(roles, { key: 'role', dir: 'asc' }))).toEqual(['hosted', 'sat at']);
    expect(names(sortGames(roles, { key: 'role', dir: 'desc' }))).toEqual(['sat at', 'hosted']);
  });

  it('breaks ties the same way every time, so rows do not drift on refetch', () => {
    const sameNight = [
      game({ id: 'b2', name: 'Same', created_at: '2026-08-02T20:00:00Z' }),
      game({ id: 'a1', name: 'Same', created_at: '2026-08-02T20:00:00Z' }),
    ];
    const once = sortGames(sameNight, { key: 'name', dir: 'asc' }).map((g) => g.id);
    const twice = sortGames([...sameNight].reverse(), { key: 'name', dir: 'asc' }).map(
      (g) => g.id,
    );
    expect(once).toEqual(['a1', 'b2']);
    expect(twice).toEqual(once);
  });

  it('leaves the caller’s array untouched', () => {
    const original = [...spread];
    sortGames(spread, { key: 'name', dir: 'asc' });
    expect(spread).toEqual(original);
  });
});

describe('nextSort', () => {
  it('flips direction when the active column is clicked again', () => {
    expect(nextSort({ key: 'name', dir: 'asc' }, 'name')).toEqual({ key: 'name', dir: 'desc' });
    expect(nextSort({ key: 'name', dir: 'desc' }, 'name')).toEqual({ key: 'name', dir: 'asc' });
  });

  it('starts a new column in its own natural direction', () => {
    expect(nextSort({ key: 'name', dir: 'desc' }, 'created_at')).toEqual(DEFAULT_SORT);
    expect(nextSort(DEFAULT_SORT, 'state')).toEqual({ key: 'state', dir: 'asc' });
  });
});
