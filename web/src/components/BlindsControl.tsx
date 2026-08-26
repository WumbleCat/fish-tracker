/** The table's stakes in the session header, and — for the host — the way to
 * change them mid-game.
 *
 * Blinds are not ledger money. Nothing here touches an entry, a net or a
 * total; the only write is the game's own small/big pair, and the server
 * records the change as a game event that the log renders. Amounts are
 * parsed to integer minor units with `parseToMinor`, never through a float.
 */

import * as Popover from '@radix-ui/react-popover';
import { useState, type FormEvent } from 'react';

import { fmtBlinds, parseToMinor, symbolFor, toDecimalString } from '../lib/money';

export function BlindsControl({
  smallMinor,
  bigMinor,
  currency,
  exponent,
  canEdit,
  onChange,
}: {
  smallMinor: number | null;
  bigMinor: number | null;
  currency: string;
  exponent: number;
  /** Host only, and not once the game is finished. */
  canEdit: boolean;
  onChange: (smallMinor: number, bigMinor: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [small, setSmall] = useState('');
  const [big, setBig] = useState('');
  const [error, setError] = useState<string | null>(null);

  const label = fmtBlinds(smallMinor, bigMinor, currency, exponent);

  const start = (next: boolean) => {
    setOpen(next);
    if (next) {
      setSmall(smallMinor === null ? '' : toDecimalString(smallMinor, currency, exponent));
      setBig(bigMinor === null ? '' : toDecimalString(bigMinor, currency, exponent));
      setError(null);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const s = parseToMinor(small, exponent);
    const b = parseToMinor(big, exponent);
    if (s === null || b === null || s <= 0 || b <= 0) {
      setError('Enter both blinds as positive amounts.');
      return;
    }
    if (b < s) {
      setError('The big blind cannot be smaller than the small blind.');
      return;
    }
    onChange(s, b);
    setOpen(false);
  };

  if (!canEdit) {
    return label ? (
      <span
        className="num rounded bg-neutral-200 px-2 py-0.5 text-xs"
        title="Blinds — the table's stakes. Not part of the ledger."
      >
        {label}
      </span>
    ) : null;
  }

  return (
    <Popover.Root open={open} onOpenChange={start}>
      <Popover.Trigger
        className="num rounded bg-neutral-200 px-2 py-0.5 text-xs hover:bg-neutral-300"
        title="Blinds — the table's stakes. Not part of the ledger."
      >
        {label ?? 'Set blinds'}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className="z-10 w-[min(18rem,calc(100vw-2rem))] rounded-lg border border-neutral-200 bg-white p-3 shadow-xl"
          collisionPadding={16}
          sideOffset={6}
        >
          <form onSubmit={submit} aria-label="change blinds">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-500">
              Blinds ({symbolFor(currency).trim() || currency})
            </p>
            <div className="flex items-end gap-2">
              <label className="flex min-w-0 flex-1 flex-col text-xs text-neutral-600">
                Small
                <input
                  autoFocus
                  value={small}
                  onChange={(e) => setSmall(e.target.value)}
                  inputMode="decimal"
                  aria-label="small blind"
                  className="num mt-1 w-full rounded border border-neutral-300 px-2 py-1.5 text-right text-base sm:text-sm"
                />
              </label>
              <label className="flex min-w-0 flex-1 flex-col text-xs text-neutral-600">
                Big
                <input
                  value={big}
                  onChange={(e) => setBig(e.target.value)}
                  inputMode="decimal"
                  aria-label="big blind"
                  className="num mt-1 w-full rounded border border-neutral-300 px-2 py-1.5 text-right text-base sm:text-sm"
                />
              </label>
              <button
                type="submit"
                className="min-h-11 rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white sm:min-h-0"
              >
                Set
              </button>
            </div>
            {error && (
              <p role="alert" className="mt-2 text-xs text-rose-700">
                {error}
              </p>
            )}
            <p className="mt-2 text-xs text-neutral-400">
              Recorded in the log with the time and who changed it. Blinds never affect
              anyone's net.
            </p>
          </form>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
