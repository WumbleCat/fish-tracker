/** Connectivity state + the reconnect trigger for the entry queue. */

import NetInfo from '@react-native-community/netinfo';
import { useEffect } from 'react';
import { create } from 'zustand';

import { api } from './api';
import { useEntryQueue, type QueuedEntry, type SendResult } from './queue';

interface OnlineState {
  online: boolean;
  setOnline: (online: boolean) => void;
}

export const useOnline = create<OnlineState>((set) => ({
  online: true,
  setOnline: (online) => set({ online }),
}));

export async function sendQueuedEntry(entry: QueuedEntry): Promise<SendResult> {
  try {
    await api.logEntry(entry.gameId, {
      entry_type: entry.entryType,
      amount_minor: entry.amountMinor,
      ...(entry.targetUserId ? { user_id: entry.targetUserId } : {}),
      client_key: entry.clientKey,
    });
    return { ok: true };
  } catch (e: unknown) {
    const status = (e as { status?: number }).status;
    const code = (e as { code?: string }).code;
    if (status && status >= 400 && status < 500) {
      // a domain refusal (cashout_already_live, game_closed…): retrying
      // won't change the answer — surface it to the owner instead
      return { ok: false, permanent: true, code };
    }
    return { ok: false };
  }
}

/** Mount once: watches connectivity and flushes the queue on reconnect. */
export function useConnectivity(): void {
  const setOnline = useOnline((s) => s.setOnline);
  const flush = useEntryQueue((s) => s.flush);
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const online = !!state.isConnected;
      setOnline(online);
      if (online) void flush(sendQueuedEntry);
    });
    return unsubscribe;
  }, [setOnline, flush]);
}
