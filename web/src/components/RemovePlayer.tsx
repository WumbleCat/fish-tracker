/** Taking someone off the table (app-logic: "Admit / remove player: host
 * only").
 *
 * The word this dialog exists to defuse is "remove". Nothing is deleted:
 * their buy-ins, their cash-out and their net all stay exactly where they
 * are, and if their position is unresolved the game still won't close until
 * the host deals with it. So the dialog says so plainly, before the button,
 * rather than leaving the host to find out at settlement. */

import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useState } from 'react';

import { ApiError } from '../lib/api';
import { playersInPlay } from '../lib/ledger';
import type { Entry, Member } from '../lib/types';

export function removePlayerErrorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    switch (e.code) {
      case 'host_must_transfer_first':
        return 'You can’t remove yourself while you hold the game — hand it over first.';
      case 'not_host':
        return 'Only the host can take someone off the table.';
      case 'game_closed':
        return 'This game is finished — its roster doesn’t change any more.';
      case 'version_conflict':
        return 'The table changed while this was open — check it and try again.';
      case 'user_not_found':
        return 'They’re not at this table.';
    }
  }
  return 'Couldn’t remove them — try again.';
}

/** Still seated, and not the host. The host leaves by handing the game over,
 * which is a different act with a different dialog — and somebody already
 * gone holds no seat to take. */
export function isRemovable(member: Member, hostId: string): boolean {
  return !member.departed_at && member.user_id !== hostId;
}

export function RemovePlayer({
  open,
  onOpenChange,
  member,
  entries,
  onRemove,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Who is being removed. Null closes the dialog — it always names a person. */
  member: Member | null;
  /** The game's entries, to say whether this person still holds chips. */
  entries: Entry[];
  /** Resolves once they're off the table; rejects with the API's error. */
  onRemove: (userId: string) => Promise<unknown>;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) return;
    setError(null);
  }, [open]);

  const holdsChips = member ? playersInPlay(entries).has(member.user_id) : false;
  const hasPending = member
    ? entries.some((e) => e.user_id === member.user_id && e.state === 'pending')
    : false;

  const submit = async () => {
    if (!member || pending) return;
    setPending(true);
    setError(null);
    try {
      await onRemove(member.user_id);
      onOpenChange(false);
    } catch (e) {
      setError(removePlayerErrorMessage(e));
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog.Root open={open && !!member} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/30" />
        <Dialog.Content className="fixed left-1/2 top-1/3 max-h-[calc(100dvh-6rem)] w-[min(24rem,calc(100vw-2rem))] -translate-x-1/2 overflow-y-auto rounded-lg bg-white p-4 shadow-xl">
          <Dialog.Title className="text-sm font-semibold">
            Remove {member?.display_name}?
          </Dialog.Title>
          <Dialog.Description className="mt-1 text-xs text-neutral-500">
            They give up their seat. Everything they logged stays in the ledger, and their net
            still counts toward settlement.
          </Dialog.Description>

          {/* The two ways this bites later, named now rather than at close. */}
          {(holdsChips || hasPending) && (
            <p className="mt-3 rounded bg-amber-50 px-2 py-1.5 text-sm text-amber-800">
              {hasPending
                ? 'They have an entry still waiting on you. Removing them doesn’t resolve it, and the game won’t close until you do.'
                : 'They haven’t cashed out, so they’ll be marked as having left unsettled until that’s logged.'}
            </p>
          )}

          {error && (
            <p role="alert" className="mt-3 text-sm text-rose-700">
              {error}
            </p>
          )}

          <div className="mt-4 flex gap-2">
            <Dialog.Close className="flex-1 rounded border border-neutral-300 px-3 py-2 text-sm text-neutral-700">
              Keep them
            </Dialog.Close>
            <button
              type="button"
              onClick={() => void submit()}
              disabled={pending}
              className="flex-1 rounded bg-rose-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {pending ? 'Removing…' : `Remove ${member?.display_name ?? ''}`.trim()}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
