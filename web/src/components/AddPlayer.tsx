/** Seating someone who is not using the app (app-logic, 2026-08-28).
 *
 * A name is the whole form, because a name is the whole row: no code, no
 * device, no account. What the host does next is log that player's buy-in,
 * so the dialog says so rather than leaving them to find the entry form. */

import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useState } from 'react';

import { ApiError } from '../lib/api';

export function addPlayerErrorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    switch (e.code) {
      case 'table_full':
        return `That table is full — ${e.detail.seats ?? 'all'} seats, all taken.`;
      case 'game_not_joinable':
        return "This game isn't seating players right now.";
      case 'not_host':
      case 'guest_not_permitted':
        return 'Only the host can seat a player.';
    }
  }
  return "Couldn't add the player — try again.";
}

export function AddPlayer({
  open,
  onOpenChange,
  onAdd,
  disabledReason,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Resolves once the player is seated; rejects with the API's error. */
  onAdd: (displayName: string) => Promise<unknown>;
  /** Set while the game cannot seat anyone. The control stays on screen and
   * says why — a draft table is one state change away from taking players,
   * and a control that vanishes teaches nothing. */
  disabledReason?: string;
}) {
  const [name, setName] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset on close, not on open: a failed add leaves the dialog standing with
  // the name still typed and the reason on screen, so the retry is one click.
  useEffect(() => {
    if (open) return;
    setError(null);
    setName('');
  }, [open]);

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed || pending) return;
    setPending(true);
    setError(null);
    try {
      await onAdd(trimmed);
      setName('');
      onOpenChange(false);
    } catch (e) {
      setError(addPlayerErrorMessage(e));
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Trigger
        disabled={!!disabledReason}
        title={disabledReason}
        className="rounded-full border border-neutral-300 px-2.5 py-0.5 text-xs text-neutral-600 hover:border-emerald-600 hover:text-emerald-700 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-neutral-300 disabled:hover:text-neutral-600"
      >
        + Add player (p)
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/30" />
        <Dialog.Content className="fixed left-1/2 top-1/3 max-h-[calc(100dvh-6rem)] w-[min(24rem,calc(100vw-2rem))] -translate-x-1/2 overflow-y-auto rounded-lg bg-white p-4 shadow-xl">
          <Dialog.Title className="text-sm font-semibold">Add a player</Dialog.Title>
          <Dialog.Description className="mt-1 text-xs text-neutral-500">
            For someone at the table who isn't using the app. You log their buy-ins and
            cash-outs; they can't log their own.
          </Dialog.Description>
          <form
            className="mt-3 space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name at the table"
              maxLength={60}
              aria-label="player name"
              className="w-full rounded border border-neutral-300 px-3 py-2 text-base sm:text-sm"
            />
            {error && (
              <p role="alert" className="text-sm text-rose-700">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={pending}
              className="w-full rounded bg-neutral-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {pending ? 'Seating…' : 'Seat them'}
            </button>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
