/**
 * Instant UI over a single source of truth. The rules:
 *
 * - An optimistic row is a CLAIM the client has made and not yet had
 *   confirmed; it is rendered in the list under its own client_key and is
 *   never merged into any money figure. Nets, totals and settlement stay
 *   exactly what the server last returned, flagged as reconciling while a
 *   write is in flight.
 * - An in-flight state change (verify, reject, void, amend) is an overlay
 *   on the row, not a change to its `state`: the row reads "verifying…"
 *   until the refetch says it IS verified.
 * - When the server answers, its data wins; nothing here survives a refetch
 *   except rows the server hasn't shown yet.
 */

import type { Entry, EntryType } from './types';

export type InFlightAction = 'verify' | 'reject' | 'void' | 'amend';
export type InFlight = Record<string, InFlightAction>;

/** Server rows first, then the optimistic rows the server hasn't shown yet. */
export function mergeEntries(server: Entry[], optimistic: Entry[]): Entry[] {
  if (optimistic.length === 0) return server;
  const seen = new Set(server.map((e) => e.client_key).filter(Boolean));
  const fresh = optimistic.filter((o) => !seen.has(o.client_key));
  return fresh.length === 0 ? server : [...server, ...fresh];
}

/** Drop optimistic rows the server now returns. Same array back when
 * nothing changed, so a state setter can no-op. */
export function pruneOptimistic(optimistic: Entry[], server: Entry[]): Entry[] {
  if (optimistic.length === 0) return optimistic;
  const seen = new Set(server.map((e) => e.client_key).filter(Boolean));
  const kept = optimistic.filter((o) => !seen.has(o.client_key));
  return kept.length === optimistic.length ? optimistic : kept;
}

/** The row a client shows the instant it logs an entry. Its id IS the
 * client key until the server row replaces it. */
export function optimisticEntry(input: {
  clientKey: string;
  gameId: string;
  userId: string;
  loggedBy: string;
  entryType: EntryType;
  amountMinor: number;
  amendsEntryId?: string | null;
}): Entry {
  return {
    id: input.clientKey,
    client_key: input.clientKey,
    game_id: input.gameId,
    user_id: input.userId,
    entry_type: input.entryType,
    amount_minor: input.amountMinor,
    state: 'pending',
    created_at: new Date().toISOString(),
    logged_by: input.loggedBy,
    verified_by: null,
    verified_at: null,
    rejection_note: null,
    void_reason: null,
    amends_entry_id: input.amendsEntryId ?? null,
    version: 0,
  };
}

/** Lists key on the client key so the optimistic row and the server row
 * are the same React node — no flicker, no duplicate. */
export function entryKey(entry: Entry): string {
  return entry.client_key ?? entry.id;
}

/** A row the server hasn't confirmed yet: its id is still the client key. */
export function isOptimistic(entry: Entry): boolean {
  return entry.client_key !== null && entry.id === entry.client_key;
}

const ACTION_VERB: Record<InFlightAction | 'log', string> = {
  log: 'logging',
  verify: 'verifying',
  reject: 'rejecting',
  void: 'voiding',
  amend: 'amending',
};

export function inFlightLabel(action: InFlightAction | 'log'): string {
  return `${ACTION_VERB[action]}…`;
}

/** The specific rollback message: what was undone, for whom, and why. */
export function undoMessage(input: {
  action: InFlightAction | 'log' | 'state change';
  amount: string;
  entryType?: EntryType | null;
  name: string;
  reason: string;
}): string {
  const what = input.entryType ? `${input.amount} ${input.entryType.replace('_', '-')}` : input.amount;
  return `Undid ${input.action} of ${what} for ${input.name} — ${input.reason}.`;
}
