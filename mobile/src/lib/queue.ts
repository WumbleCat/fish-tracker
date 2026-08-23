/**
 * The offline entry queue. Phones lose signal in kitchens and basements;
 * an entry logged offline is held here in a "not sent" state — visibly
 * different from "pending", because one means the server hasn't seen it
 * and the other means the host hasn't — and flushed on reconnect.
 *
 * Only own-entry WRITES are ever queued. Verifications, rejections, voids,
 * state changes and close depend on server state that may have moved, so
 * they are refused offline (see actions.ts), never queued.
 *
 * Each queued entry carries a client-generated idempotency key; the server
 * collapses replays of the same key onto the original row, so a flaky
 * reconnect can't log the same buy-in twice.
 */

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

import type { EntryType } from './types';

export interface QueuedEntry {
  clientKey: string;
  gameId: string;
  entryType: EntryType;
  amountMinor: number;
  targetUserId?: string;
  queuedAt: string;
  /** set when the server rejected it with a domain error — needs the user */
  failedCode?: string;
}

export interface SendResult {
  ok: boolean;
  /** a domain rejection (4xx): retrying won't help, surface it */
  permanent?: boolean;
  code?: string;
}

type Sender = (entry: QueuedEntry) => Promise<SendResult>;

interface QueueState {
  entries: QueuedEntry[];
  flushing: boolean;
  enqueue: (entry: Omit<QueuedEntry, 'queuedAt'>) => void;
  remove: (clientKey: string) => void;
  /** Sends every queued entry once, in order. Single-flight: concurrent
   * calls (reconnect + manual retry) can't double-send. */
  flush: (send: Sender) => Promise<void>;
}

export const useEntryQueue = create<QueueState>()(
  persist(
    (set, get) => ({
      entries: [],
      flushing: false,
      enqueue: (entry) =>
        set((s) => ({
          entries: [...s.entries, { ...entry, queuedAt: new Date().toISOString() }],
        })),
      remove: (clientKey) =>
        set((s) => ({ entries: s.entries.filter((e) => e.clientKey !== clientKey) })),
      flush: async (send) => {
        if (get().flushing) return;
        set({ flushing: true });
        try {
          for (const entry of [...get().entries]) {
            if (entry.failedCode) continue; // needs the user, not a retry
            const result = await send(entry);
            if (result.ok) {
              get().remove(entry.clientKey);
            } else if (result.permanent) {
              set((s) => ({
                entries: s.entries.map((e) =>
                  e.clientKey === entry.clientKey ? { ...e, failedCode: result.code } : e,
                ),
              }));
            }
            // transient failure: keep it queued for the next reconnect
          }
        } finally {
          set({ flushing: false });
        }
      },
    }),
    { name: 'fish-entry-queue', storage: createJSONStorage(() => AsyncStorage) },
  ),
);
