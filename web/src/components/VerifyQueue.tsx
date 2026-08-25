/** The host's working surface: every pending entry, oldest first, one row
 * at a time, keyboard-driven — ↑/↓ select, v verifies, x rejects. Each
 * entry is acted on individually; there is deliberately no verify-all. */

import { useEffect, useMemo, useState } from 'react';

import { pendingEntries } from '../lib/ledger';
import { entryKey, isOptimistic, type InFlight } from '../lib/optimistic';
import { useShortcuts } from '../lib/shortcuts';
import type { Entry } from '../lib/types';
import { Amount } from './Amount';

export function VerifyQueue({
  entries,
  inflight = {},
  nameOf,
  currency,
  exponent,
  onVerify,
  onReject,
  onSelect,
  shortcutsEnabled = true,
}: {
  entries: Entry[];
  /** Entries already acted on and awaiting the server leave the queue at
   * once — v, v, v advances without waiting — while their state stays
   * whatever the server last said. */
  inflight?: InFlight;
  nameOf: (userId: string) => string;
  currency: string;
  exponent: number;
  onVerify: (entry: Entry) => void;
  onReject: (entry: Entry, note: string | null) => void;
  onSelect?: (entry: Entry | null) => void;
  shortcutsEnabled?: boolean;
}) {
  const queue = useMemo(
    () => pendingEntries(entries).filter((e) => !inflight[e.id]),
    [entries, inflight],
  );
  const [selected, setSelected] = useState(0);
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [note, setNote] = useState('');

  useEffect(() => {
    if (selected >= queue.length) setSelected(Math.max(0, queue.length - 1));
  }, [queue.length, selected]);

  const current = queue[selected];

  // the parent follows the focused entry (e.g. to show that player's bank
  // details beside the queue)
  useEffect(() => {
    onSelect?.(current ?? null);
  }, [current, onSelect]);

  useShortcuts(
    {
      ArrowDown: () => setSelected((s) => Math.min(s + 1, queue.length - 1)),
      ArrowUp: () => setSelected((s) => Math.max(s - 1, 0)),
      v: () => current && onVerify(current),
      x: () => current && setNoteFor(current.id),
      Escape: () => setNoteFor(null),
    },
    shortcutsEnabled && queue.length > 0,
  );

  if (queue.length === 0) {
    return (
      <p className="text-sm text-neutral-500">
        Nothing awaiting verification. Claims appear here the moment they're logged.
      </p>
    );
  }

  return (
    <ul aria-label="verification queue" className="divide-y divide-neutral-200">
      {queue.map((entry, index) => (
        <li
          key={entryKey(entry)}
          aria-selected={index === selected}
          onClick={() => setSelected(index)}
          // flex-wrap so the reject form (w-full) drops to its own line
          // instead of stretching the row past the panel
          className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 px-2 py-1.5 text-sm ${
            index === selected ? 'bg-amber-50 ring-1 ring-amber-300' : ''
          }`}
        >
          <span className="w-24 min-w-0 shrink truncate font-medium sm:w-28">
            {nameOf(entry.user_id)}
          </span>
          <span className="w-16 shrink-0 text-neutral-500">
            {entry.entry_type.replace('_', '-')}
          </span>
          <Amount minor={entry.amount_minor} currency={currency} exponent={exponent} />
          {entry.amends_entry_id && (
            <span className="text-xs text-neutral-400">amends a rejected entry</span>
          )}
          {isOptimistic(entry) ? (
            <span className="ml-auto text-xs text-neutral-400" aria-live="polite">
              logging…
            </span>
          ) : (
            // gap-3 between them, not gap-1: verify and reject must not be
            // adjacent targets a thumb can slip between
            <span className="ml-auto flex shrink-0 gap-3 sm:gap-1">
              <button
                onClick={() => onVerify(entry)}
                className="min-h-11 rounded bg-emerald-700 px-3 py-0.5 text-xs font-medium text-white sm:min-h-0 sm:px-2"
              >
                Verify
              </button>
              <button
                onClick={() => setNoteFor(entry.id)}
                className="min-h-11 rounded border border-rose-300 px-3 py-0.5 text-xs text-rose-700 sm:min-h-0 sm:px-2"
              >
                Reject
              </button>
            </span>
          )}
          {noteFor === entry.id && (
            <form
              className="flex w-full gap-1 pt-1"
              onSubmit={(e) => {
                e.preventDefault();
                onReject(entry, note.trim() || null);
                setNoteFor(null);
                setNote('');
              }}
            >
              <input
                autoFocus
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="note, e.g. 'you put in 20, not 40' (optional)"
                className="min-w-0 flex-1 rounded border border-neutral-300 px-2 py-1 text-base sm:text-xs"
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setNoteFor(null);
                    setNote('');
                  }
                }}
              />
              <button
                type="submit"
                className="rounded bg-rose-700 px-2 py-0.5 text-xs font-medium text-white"
              >
                Reject
              </button>
            </form>
          )}
        </li>
      ))}
    </ul>
  );
}
