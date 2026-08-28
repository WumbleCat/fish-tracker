/** Handing the game to someone else (app-logic: "Hosts go to the shop, or
 * bust out and lose interest, and a game that can't be closed because one
 * person left is a real failure").
 *
 * Two things this screen owes the person using it: the button names who is
 * about to become host, and it says what the current host gives up. Nothing
 * here is undoable from this side — only the new host can hand it back. */

import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useState } from 'react';

import { ApiError } from '../lib/api';
import type { Member } from '../lib/types';

export function transferHostErrorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    switch (e.code) {
      case 'guest_not_permitted':
        return 'Guests can never host — pick a signed-in player.';
      case 'not_host':
        return 'Only the host can hand the game over.';
      case 'game_closed':
        return 'This game is closed — the host of a closed game never changes.';
      case 'version_conflict':
        return 'The game changed while this was open — check it and try again.';
      case 'user_not_found':
        return 'That player is no longer at the table.';
    }
  }
  return "Couldn't hand over the game — try again.";
}

/** Registered, still seated, and not the host already. Guests are never
 * eligible, including via transfer. */
export function eligibleHosts(members: Member[], hostId: string): Member[] {
  return members.filter((m) => !m.departed_at && !m.is_guest && m.user_id !== hostId);
}

export function TransferHost({
  open,
  onOpenChange,
  members,
  hostId,
  onTransfer,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  members: Member[];
  hostId: string;
  /** Resolves once the game has a new host; rejects with the API's error. */
  onTransfer: (userId: string) => Promise<unknown>;
}) {
  const [chosen, setChosen] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const eligible = eligibleHosts(members, hostId);
  const chosenName = eligible.find((m) => m.user_id === chosen)?.display_name ?? null;

  useEffect(() => {
    if (open) return;
    setChosen(null);
    setError(null);
  }, [open]);

  const submit = async () => {
    if (!chosen || pending) return;
    setPending(true);
    setError(null);
    try {
      await onTransfer(chosen);
      onOpenChange(false);
    } catch (e) {
      setError(transferHostErrorMessage(e));
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Trigger className="rounded-full border border-neutral-300 px-2.5 py-0.5 text-xs text-neutral-600 hover:border-emerald-600 hover:text-emerald-700">
        Hand over host
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/30" />
        <Dialog.Content className="fixed left-1/2 top-1/4 max-h-[calc(100dvh-6rem)] w-[min(24rem,calc(100vw-2rem))] -translate-x-1/2 overflow-y-auto rounded-lg bg-white p-4 shadow-xl">
          <Dialog.Title className="text-sm font-semibold">Hand over host</Dialog.Title>
          <Dialog.Description className="mt-1 text-xs text-neutral-500">
            You'll become an ordinary player: no verifying, no closing the game. Only the new
            host can hand it back.
          </Dialog.Description>

          {eligible.length === 0 ? (
            // absence with a reason, not a disabled list
            <p className="mt-3 text-sm text-neutral-600">
              Nobody at this table can take it. Only signed-in players can host — a guest never
              can, however long they've been playing.
            </p>
          ) : (
            <form
              className="mt-3 space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                void submit();
              }}
            >
              <fieldset className="space-y-1">
                <legend className="sr-only">Choose the new host</legend>
                {eligible.map((m) => (
                  <label
                    key={m.user_id}
                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-neutral-100"
                  >
                    <input
                      type="radio"
                      name="new-host"
                      value={m.user_id}
                      checked={chosen === m.user_id}
                      onChange={() => {
                        setChosen(m.user_id);
                        setError(null);
                      }}
                    />
                    {m.display_name}
                  </label>
                ))}
              </fieldset>
              {error && (
                <p role="alert" className="text-sm text-rose-700">
                  {error}
                </p>
              )}
              <button
                type="submit"
                disabled={!chosen || pending}
                className="w-full rounded bg-neutral-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                {pending
                  ? 'Handing over…'
                  : chosenName
                    ? `Make ${chosenName} the host`
                    : 'Choose a player'}
              </button>
            </form>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
