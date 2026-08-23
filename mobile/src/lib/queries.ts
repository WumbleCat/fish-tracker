import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { api } from './api';
import { supabase } from './supabase';

export function useMe(enabled: boolean) {
  return useQuery({ queryKey: ['me'], queryFn: api.me, enabled });
}

export function useGames(enabled = true) {
  return useQuery({ queryKey: ['games'], queryFn: api.games, enabled });
}

export function useGame(id: string | undefined) {
  return useQuery({
    queryKey: ['game', id],
    queryFn: () => api.game(id!),
    enabled: !!id,
  });
}

export function useSettlement(id: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ['settlement', id],
    queryFn: () => api.settlement(id!),
    enabled: !!id && enabled,
    // The settle screen must never show numbers computed from stale data.
    staleTime: 0,
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

/** Realtime events are cache invalidation ONLY — nothing is ever derived
 * from a payload; the refetch renders whatever the API returns. */
export function useGameRealtime(gameId: string | undefined): void {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!gameId) return;
    const invalidate = () => {
      void queryClient.invalidateQueries({ queryKey: ['game', gameId] });
      void queryClient.invalidateQueries({ queryKey: ['settlement', gameId] });
    };
    const channel = supabase
      .channel(`game-${gameId}`)
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
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [gameId, queryClient]);
}
