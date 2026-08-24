import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { api } from './api';
import { supabase } from './supabase';
import type { Game } from './types';

export function useMe(enabled: boolean) {
  return useQuery({ queryKey: ['me'], queryFn: api.me, enabled });
}

export function useGames() {
  return useQuery({ queryKey: ['games'], queryFn: api.games });
}

// Realtime is the primary freshness signal; a live game also polls as a
// safety net so a dropped subscription can never leave a stale ledger on
// screen at the table. A closed game is immutable and polls not at all.
const LIVE_POLL_MS = 5_000;
const isLive = (game: Game | undefined) =>
  game?.state === 'running' || game?.state === 'settling' || game?.state === 'open';

export function useGame(id: string | undefined) {
  return useQuery({
    queryKey: ['game', id],
    queryFn: () => api.game(id!),
    enabled: !!id,
    refetchInterval: (query) => (isLive(query.state.data) ? LIVE_POLL_MS : false),
  });
}

/** Warm the cache on hover/focus so the click renders from data, not a spinner. */
export function prefetchGame(queryClient: QueryClient, id: string): void {
  void queryClient.prefetchQuery({ queryKey: ['game', id], queryFn: () => api.game(id) });
}

export function prefetchNav(queryClient: QueryClient, target: 'games' | 'history' | 'me'): void {
  switch (target) {
    case 'games':
      void queryClient.prefetchQuery({ queryKey: ['games'], queryFn: api.games });
      break;
    case 'history':
      void queryClient.prefetchQuery({ queryKey: ['history'], queryFn: api.history });
      break;
    case 'me':
      void queryClient.prefetchQuery({ queryKey: ['me'], queryFn: api.me });
      break;
  }
}

export function useSettlement(id: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ['settlement', id],
    queryFn: () => api.settlement(id!),
    enabled: !!id && enabled,
  });
}

export function useGamePayoutDetails(id: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ['payout-details', id],
    queryFn: () => api.gamePayoutDetails(id!),
    enabled: !!id && enabled,
  });
}

export function useHistory(enabled: boolean) {
  return useQuery({ queryKey: ['history'], queryFn: api.history, enabled });
}

export function useMyGames(enabled: boolean) {
  return useQuery({ queryKey: ['my-games'], queryFn: api.myGames, enabled });
}

/**
 * Live nets: subscribe to this game's entries and roster over Supabase
 * Realtime, and use each event ONLY to invalidate the query cache. The
 * refetch renders whatever the API returns; nothing is ever derived from a
 * Realtime payload — that would be a second settlement implementation.
 */
export function useGameRealtime(gameId: string | undefined): void {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!gameId) return;
    const invalidate = () => {
      void queryClient.invalidateQueries({ queryKey: ['game', gameId] });
      void queryClient.invalidateQueries({ queryKey: ['settlement', gameId] });
    };
    // unique topic per mount: two screens of the same game must not
    // grab the same channel instance (adding callbacks after subscribe throws)
    const channel = supabase
      .channel(`game-${gameId}-${Math.random().toString(36).slice(2)}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'entries', filter: `game_id=eq.${gameId}` },
        invalidate,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'game_members', filter: `game_id=eq.${gameId}` },
        invalidate,
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${gameId}` },
        invalidate,
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [gameId, queryClient]);
}
