/**
 * Host actions and their offline rules, in one place so a screen can't
 * accidentally invent a queued verification.
 *
 * Verification is NEVER optimistic and NEVER queued: it asserts a fact
 * about server state, and the entry may have changed (amended, rejected,
 * already verified) while the phone was away. Offline, these throw and the
 * UI disables the controls with a plain "you're offline".
 */

import { api } from './api';
import type { Entry } from './types';

export class OfflineError extends Error {
  constructor() {
    super('offline');
  }
}

export async function verifyEntry(entry: Entry, online: boolean) {
  if (!online) throw new OfflineError();
  return api.verify(entry.id, entry.version);
}

export async function rejectEntry(entry: Entry, note: string | null, online: boolean) {
  if (!online) throw new OfflineError();
  return api.reject(entry.id, note ?? undefined, entry.version);
}

export async function amendEntry(entry: Entry, amountMinor: number, online: boolean) {
  if (!online) throw new OfflineError();
  return api.amend(entry.id, amountMinor, entry.version);
}

export async function closeGame(
  gameId: string,
  acknowledge: boolean,
  version: number,
  online: boolean,
) {
  if (!online) throw new OfflineError();
  return api.close(gameId, acknowledge, version);
}
