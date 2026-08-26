/** The full audit trail: every entry in every state, nothing hidden.
 * Rejected rows offer inline amend to their owner — the amend creates a
 * NEW pending row and the table keeps showing both. Row actions appear on
 * hover rather than occupying permanent space. */

import { useState } from 'react';

import { parseToMinor } from '../lib/money';
import { entryKey, inFlightLabel, isOptimistic, type InFlight } from '../lib/optimistic';
import { fmtBlinds } from '../lib/money';
import type { Entry, Game, GameEvent } from '../lib/types';
import { Amount } from './Amount';

const STATE_STYLES: Record<Entry['state'], string> = {
  pending: 'text-amber-700 bg-amber-50',
  verified: 'text-emerald-700 bg-emerald-50',
  rejected: 'text-rose-700 bg-rose-50',
  void: 'text-neutral-400 bg-neutral-100 line-through',
};

/** A non-money row in the log: muted, dashed amount column, and visibly not
 * a claim about money. */
function EventRow({ event, game }: { event: GameEvent; game: Game }) {
  const { currency, currency_exponent: exponent } = game;
  const who =
    game.members.find((m) => m.user_id === event.actor_user_id)?.display_name ?? 'the host';
  const from = fmtBlinds(
    event.from_small_blind_minor,
    event.from_big_blind_minor,
    currency,
    exponent,
  );
  const to = fmtBlinds(event.to_small_blind_minor, event.to_big_blind_minor, currency, exponent);

  return (
    <tr className="border-b border-neutral-100 bg-neutral-50/60 text-neutral-500">
      <td className="num py-1 pr-2">
        {new Date(event.created_at).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        })}
      </td>
      <td className="px-2 py-1">{who}</td>
      <td className="px-2 py-1 italic">blinds</td>
      {/* no amount: an event is not money */}
      <td className="px-2 py-1 text-right">—</td>
      <td className="num px-2 py-1" colSpan={3}>
        {from ? `${from} → ${to}` : `set to ${to}`}
      </td>
    </tr>
  );
}

export function EntryLog({
  game,
  meId,
  isHost,
  inflight = {},
  onVerify,
  onReject,
  onVoid,
  onAmend,
}: {
  game: Game;
  meId: string | null;
  isHost: boolean;
  /** Actions the server hasn't confirmed yet, by entry id — shown as an
   * overlay; the row's state itself only changes when the server says so. */
  inflight?: InFlight;
  onVerify: (entry: Entry) => void;
  onReject: (entry: Entry) => void;
  onVoid: (entry: Entry, reason: string) => void;
  onAmend: (entry: Entry, amountMinor: number) => void;
}) {
  const { currency, currency_exponent: exponent } = game;
  const nameOf = (id: string) =>
    game.members.find((m) => m.user_id === id)?.display_name ?? 'unknown';
  const [amending, setAmending] = useState<string | null>(null);
  const [amendValue, setAmendValue] = useState('');
  const [voiding, setVoiding] = useState<string | null>(null);
  const [voidReason, setVoidReason] = useState('');

  // Entries and events share the timeline so the night reads in one pass.
  // Events carry no amount and are never counted — they are rendered, not
  // summed (app-logic, 2026-08-26).
  type Row =
    | { kind: 'entry'; at: string; entry: Entry }
    | { kind: 'event'; at: string; event: GameEvent };
  const rows: Row[] = [
    ...game.entries.map((e) => ({ kind: 'entry' as const, at: e.created_at, entry: e })),
    ...(game.events ?? []).map((e) => ({
      kind: 'event' as const,
      at: e.created_at,
      event: e,
    })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  return (
    <div className="overflow-x-auto">
    <table className="w-full min-w-[44rem] border-collapse text-xs" aria-label="entry log">
      <thead>
        <tr className="border-b border-neutral-300 text-left uppercase tracking-wide text-neutral-500">
          <th className="py-1 pr-2">Time</th>
          <th className="px-2 py-1">Player</th>
          <th className="px-2 py-1">Type</th>
          <th className="num px-2 py-1 text-right">Amount</th>
          <th className="px-2 py-1">State</th>
          <th className="px-2 py-1">Note</th>
          <th className="px-2 py-1" />
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          if (row.kind === 'event') return <EventRow key={row.event.id} event={row.event} game={game} />;
          const entry = row.entry;
          const provisional = inflight[entry.id] ?? (isOptimistic(entry) ? 'log' : null);
          return (
            <tr key={entryKey(entry)} className="group border-b border-neutral-100">
              <td className="num py-1 pr-2 text-neutral-500">
                {new Date(entry.created_at).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </td>
              <td className="px-2 py-1">
                {nameOf(entry.user_id)}
                {entry.logged_by !== entry.user_id && (
                  <span className="text-neutral-400"> (by {nameOf(entry.logged_by)})</span>
                )}
              </td>
              <td className="px-2 py-1">{entry.entry_type.replace('_', '-')}</td>
              <td className="px-2 py-1 text-right">
                <Amount minor={entry.amount_minor} currency={currency} exponent={exponent} />
              </td>
              <td className="px-2 py-1">
                <span className={`rounded px-1.5 py-0.5 ${STATE_STYLES[entry.state]}`}>
                  {entry.state}
                </span>
                {provisional && (
                  <span
                    className="ml-1 rounded bg-neutral-200 px-1 text-neutral-600"
                    aria-live="polite"
                  >
                    {inFlightLabel(provisional)}
                  </span>
                )}
                {entry.verified_by === entry.user_id && entry.state === 'verified' && (
                  <span className="ml-1 text-neutral-400" title="host verified their own entry">
                    self
                  </span>
                )}
              </td>
              <td className="max-w-40 truncate px-2 py-1 text-neutral-500">
                {entry.rejection_note ?? entry.void_reason ?? ''}
                {entry.amends_entry_id && <span className="text-neutral-400"> (amendment)</span>}
              </td>
              <td className="px-2 py-1 text-right">
                {!provisional && (
                  // Hover-gated actions are unreachable on a touch screen —
                  // there is no hover to give. Below sm they are simply
                  // present; the hover affordance resumes from sm up.
                  <span className="flex justify-end gap-1 [&>button]:min-h-11 sm:invisible sm:group-hover:visible sm:[&>button]:min-h-0">
                    {isHost && (entry.state === 'pending' || entry.state === 'rejected') && (
                      <button
                        onClick={() => onVerify(entry)}
                        className="rounded bg-emerald-700 px-1.5 text-white"
                      >
                        verify
                      </button>
                    )}
                    {isHost && entry.state === 'pending' && (
                      <button
                        onClick={() => onReject(entry)}
                        className="rounded border border-rose-300 px-1.5 text-rose-700"
                      >
                        reject
                      </button>
                    )}
                    {isHost && entry.state === 'verified' && (
                      <button
                        onClick={() => {
                          setVoiding(entry.id);
                          setVoidReason('');
                        }}
                        className="rounded border border-neutral-300 px-1.5 text-neutral-600"
                      >
                        void
                      </button>
                    )}
                    {entry.state === 'rejected' && entry.user_id === meId && (
                      <button
                        onClick={() => {
                          setAmending(entry.id);
                          setAmendValue('');
                        }}
                        className="rounded bg-amber-600 px-1.5 text-white"
                      >
                        amend
                      </button>
                    )}
                  </span>
                )}
                {amending === entry.id && (
                  <form
                    className="flex justify-end gap-1 pt-1"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const minor = parseToMinor(amendValue, exponent);
                      if (minor !== null && minor > 0) {
                        onAmend(entry, minor);
                        setAmending(null);
                      }
                    }}
                  >
                    <input
                      autoFocus
                      value={amendValue}
                      onChange={(e) => setAmendValue(e.target.value)}
                      onKeyDown={(e) => e.key === 'Escape' && setAmending(null)}
                      placeholder="corrected amount"
                      aria-label="corrected amount"
                      className="num w-24 rounded border border-neutral-300 px-1.5 py-0.5 text-right text-base sm:text-xs"
                    />
                    <button type="submit" className="rounded bg-amber-600 px-1.5 text-white">
                      log
                    </button>
                  </form>
                )}
                {voiding === entry.id && (
                  <form
                    className="flex justify-end gap-1 pt-1"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (voidReason.trim()) {
                        onVoid(entry, voidReason.trim());
                        setVoiding(null);
                      }
                    }}
                  >
                    <input
                      autoFocus
                      value={voidReason}
                      onChange={(e) => setVoidReason(e.target.value)}
                      onKeyDown={(e) => e.key === 'Escape' && setVoiding(null)}
                      placeholder="reason (required)"
                      aria-label="void reason"
                      className="w-36 rounded border border-neutral-300 px-1.5 py-0.5 text-base sm:text-xs"
                    />
                    <button type="submit" className="rounded bg-neutral-700 px-1.5 text-white">
                      void
                    </button>
                  </form>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
    </div>
  );
}
