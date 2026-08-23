/** Keyboard-first entry: Tab through fields, Enter submits and immediately
 * refocuses the first field for the next entry, Esc cancels. Reaching for
 * the mouse between entries means this component has failed. */

import { useRef, useState, type FormEvent } from 'react';

import { parseToMinor, symbolFor } from '../lib/money';
import type { EntryType, Member } from '../lib/types';

export interface EntryDraft {
  userId: string;
  entryType: EntryType;
  amountMinor: number;
}

export function EntryForm({
  members,
  currency,
  exponent,
  defaultType = 'buy_in',
  defaultUserId,
  allowedTypes = ['buy_in', 'rebuy', 'cash_out'],
  canPickPlayer,
  onSubmit,
  onCancel,
}: {
  members: Member[];
  currency: string;
  exponent: number;
  defaultType?: EntryType;
  defaultUserId?: string;
  allowedTypes?: EntryType[];
  /** Hosts log on anyone's behalf; players only for themselves. */
  canPickPlayer: boolean;
  onSubmit: (draft: EntryDraft) => Promise<void> | void;
  onCancel?: () => void;
}) {
  const active = members.filter((m) => !m.departed_at);
  const [userId, setUserId] = useState(defaultUserId ?? active[0]?.user_id ?? '');
  const [entryType, setEntryType] = useState<EntryType>(defaultType);
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);
  const firstFieldRef = useRef<HTMLSelectElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const minor = parseToMinor(amount, exponent);
    if (minor === null || minor <= 0) {
      setError(`Enter a positive amount with at most ${exponent} decimal places`);
      amountRef.current?.select();
      return;
    }
    try {
      await onSubmit({ userId, entryType, amountMinor: minor });
      // never discard typed context: keep player+type, clear amount, refocus
      setAmount('');
      setError(null);
      (canPickPlayer ? firstFieldRef : amountRef).current?.focus();
    } catch (e) {
      // keep the form contents so the user can retry
      setError(e instanceof Error ? e.message : 'save failed');
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onCancel?.();
      }}
      className="flex items-end gap-2"
      aria-label="log entry"
    >
      {canPickPlayer && (
        <label className="flex flex-col text-xs text-neutral-600">
          Player
          <select
            ref={firstFieldRef}
            autoFocus
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            className="mt-1 rounded border border-neutral-300 bg-white px-2 py-1.5 text-sm text-neutral-900"
          >
            {active.map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {m.display_name}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="flex flex-col text-xs text-neutral-600">
        Type
        <select
          value={entryType}
          onChange={(e) => setEntryType(e.target.value as EntryType)}
          className="mt-1 rounded border border-neutral-300 bg-white px-2 py-1.5 text-sm text-neutral-900"
        >
          {allowedTypes.map((t) => (
            <option key={t} value={t}>
              {t.replace('_', '-')}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col text-xs text-neutral-600">
        Amount ({symbolFor(currency).trim() || currency})
        <input
          ref={amountRef}
          autoFocus={!canPickPlayer}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          inputMode="decimal"
          placeholder={exponent > 0 ? `0.${'0'.repeat(exponent)}` : '0'}
          className="num mt-1 w-28 rounded border border-neutral-300 bg-white px-2 py-1.5 text-right text-sm"
          aria-label="amount"
        />
      </label>
      <button
        type="submit"
        className="rounded bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-800"
      >
        Log
      </button>
      {error && (
        <span role="alert" className="text-xs text-rose-700">
          {error}
        </span>
      )}
    </form>
  );
}
