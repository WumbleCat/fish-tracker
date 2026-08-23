/** The host's working surface: every pending entry, oldest first, one row
 * at a time, keyboard-driven — ↑/↓ select, v verifies, x rejects. Each
 * entry is acted on individually; there is deliberately no verify-all. */

import { useEffect, useMemo, useState } from 'react';

import { pendingEntries } from '../lib/ledger';
import { useShortcuts } from '../lib/shortcuts';
import type { Entry } from '../lib/types';
import { Amount } from './Amount';

export function VerifyQueue({
  entries,
  nameOf,
  currency,
  exponent,
  onVerify,
  onReject,
  shortcutsEnabled = true,
}: {
  entries: Entry[];
  nameOf: (userId: string) => string;
  currency: string;
  exponent: number;
  onVerify: (entry: Entry) => void;
  onReject: (entry: Entry, note: string | null) => void;
  shortcutsEnabled?: boolean;
}) {
  const queue = useMemo(() => pendingEntries(entries), [entries]);
  const [selected, setSelected] = useState(0);
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [note, setNote] = useState('');

  useEffect(() => {
    if (selected >= queue.length) setSelected(Math.max(0, queue.length - 1));
  }, [queue.length, selected]);

  const current = queue[selected];

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
          key={entry.id}
          aria-selected={index === selected}
          onClick={() => setSelected(index)}
          className={`flex items-center gap-3 px-2 py-1.5 text-sm ${
            index === selected ? 'bg-amber-50 ring-1 ring-amber-300' : ''
          }`}
        >
          <span className="w-28 truncate font-medium">{nameOf(entry.user_id)}</span>
          <span className="w-16 text-neutral-500">{entry.entry_type.replace('_', '-')}</span>
          <Amount minor={entry.amount_minor} currency={currency} exponent={exponent} />
          {entry.amends_entry_id && (
            <span className="text-xs text-neutral-400">amends a rejected entry</span>
          )}
          <span className="ml-auto flex gap-1">
            <button
              onClick={() => onVerify(entry)}
              className="rounded bg-emerald-700 px-2 py-0.5 text-xs font-medium text-white"
            >
              Verify
            </button>
            <button
              onClick={() => setNoteFor(entry.id)}
              className="rounded border border-rose-300 px-2 py-0.5 text-xs text-rose-700"
            >
              Reject
            </button>
          </span>
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
                className="flex-1 rounded border border-neutral-300 px-2 py-1 text-xs"
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
