/** The primary screen: ledger beside the running settlement, so the effect
 * of a verification is visible without navigating. Realtime invalidates the
 * cache; every figure on screen is whatever the API last returned. */

import * as Popover from '@radix-ui/react-popover';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';

import { Amount } from '../components/Amount';
import { EntryForm, type EntryDraft } from '../components/EntryForm';
import { EntryLog } from '../components/EntryLog';
import { LedgerTable } from '../components/LedgerTable';
import { PayoutBlock } from '../components/PayoutBlock';
import { PlayerBankCard } from '../components/PlayerBankCard';
import { SettlementPanel } from '../components/SettlementPanel';
import { VerifyQueue } from '../components/VerifyQueue';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import {
  useGame,
  useGamePayoutDetails,
  useGameRealtime,
  useMe,
  useSettlement,
} from '../lib/queries';
import { useShortcuts } from '../lib/shortcuts';
import type { Entry, EntryType, GameState } from '../lib/types';

const NEXT_STATE: Partial<Record<GameState, { to: GameState; label: string }>> = {
  draft: { to: 'open', label: 'Open for joins' },
  open: { to: 'running', label: 'Start game' },
  running: { to: 'settling', label: 'Stop play & settle' },
  settling: { to: 'running', label: 'One more orbit' },
};

export function Session() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const { status, guest } = useAuth();
  const isGuest = status === 'guest';
  const { data: me } = useMe(!isGuest);
  const meId = isGuest ? (guest?.userId ?? null) : (me?.id ?? null);

  const { data: game, error: gameError } = useGame(id);
  useGameRealtime(id);
  // A running game never balances (the chips are still out), so the
  // settlement panel — and its reconciliation gate — appear once play stops.
  const showSettlement = game?.state === 'settling' || game?.state === 'closed';
  const { data: settlement } = useSettlement(id, !!showSettlement);
  const { data: payoutDetails } = useGamePayoutDetails(id, !isGuest);

  const isHost = !!game && game.host_id === meId;
  const [entryFormOpen, setEntryFormOpen] = useState(false);
  const [entryDefaults, setEntryDefaults] = useState<{ type: EntryType; userId?: string }>({
    type: 'buy_in',
  });
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [queueUserId, setQueueUserId] = useState<string | null>(null);
  const [conflict, setConflict] = useState<string | null>(null);
  const onQueueSelect = useCallback((entry: Entry | null) => setQueueUserId(entry?.user_id ?? null), []);

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['game', id] });
    void queryClient.invalidateQueries({ queryKey: ['settlement', id] });
  }, [queryClient, id]);

  const onApiError = useCallback(
    (e: unknown) => {
      if (e instanceof ApiError && e.code === 'version_conflict') {
        // the entry changed under us: refetch, show what it is now, let the
        // user redo the action — never retry silently
        invalidate();
        setConflict('That entry changed under you. Showing the latest — redo the action if it still applies.');
        setTimeout(() => setConflict(null), 6000);
      } else if (e instanceof ApiError) {
        setConflict(`Action refused: ${e.code.replaceAll('_', ' ')}`);
        setTimeout(() => setConflict(null), 6000);
      }
    },
    [invalidate],
  );

  const logEntry = useMutation({
    mutationFn: (draft: EntryDraft) =>
      api.logEntry(id!, {
        entry_type: draft.entryType,
        amount_minor: draft.amountMinor,
        ...(draft.userId !== meId ? { user_id: draft.userId } : {}),
      }),
    onSuccess: invalidate,
    onError: onApiError,
  });
  const verify = useMutation({
    mutationFn: (entry: Entry) => api.verify(entry.id, entry.version),
    onSuccess: invalidate,
    onError: onApiError,
  });
  const reject = useMutation({
    mutationFn: ({ entry, note }: { entry: Entry; note: string | null }) =>
      api.reject(entry.id, note ?? undefined, entry.version),
    onSuccess: invalidate,
    onError: onApiError,
  });
  const voidEntry = useMutation({
    mutationFn: ({ entry, reason }: { entry: Entry; reason: string }) =>
      api.voidEntry(entry.id, reason, entry.version),
    onSuccess: invalidate,
    onError: onApiError,
  });
  const amend = useMutation({
    mutationFn: ({ entry, amountMinor }: { entry: Entry; amountMinor: number }) =>
      api.amend(entry.id, amountMinor, entry.version),
    onSuccess: invalidate,
    onError: onApiError,
  });
  const changeState = useMutation({
    mutationFn: (to: GameState) => api.changeState(id!, to, game?.version),
    onSuccess: invalidate,
    onError: onApiError,
  });
  const close = useMutation({
    mutationFn: (acknowledge: boolean) => api.close(id!, acknowledge, game?.version),
    onSuccess: invalidate,
    onError: onApiError,
  });

  const openEntryForm = useCallback(
    (type: EntryType, userId?: string) => {
      setEntryDefaults({ type, userId });
      setEntryFormOpen(true);
    },
    [],
  );

  const shortcuts = useMemo(
    () => ({
      n: () => openEntryForm('buy_in'),
      r: () => openEntryForm('rebuy', selectedUserId ?? undefined),
      c: () => openEntryForm('cash_out', selectedUserId ?? undefined),
      Escape: () => setEntryFormOpen(false),
    }),
    [openEntryForm, selectedUserId],
  );
  useShortcuts(shortcuts, !!game && (game.state === 'running' || game.state === 'settling'));

  if (gameError instanceof ApiError && gameError.code === 'game_not_found') {
    return <p className="mt-16 text-center text-neutral-500">No such game, or you're not in it.</p>;
  }
  if (!game) return <p className="mt-16 text-center text-neutral-400">Loading…</p>;

  const { currency, currency_exponent: exponent } = game;
  const nameOf = (userId: string) =>
    game.members.find((m) => m.user_id === userId)?.display_name ?? 'unknown';
  const hostDetails = payoutDetails?.find((d) => d.user_id === game.host_id) ?? null;
  // the player the host is acting on: the focused queue entry first, then
  // the ledger selection — whoever is about to be paid out
  const focusUserId = queueUserId ?? selectedUserId;
  const focusDetails =
    (focusUserId && payoutDetails?.find((d) => d.user_id === focusUserId)) || null;
  const settleableTable =
    game.totals.verified_buy_ins_minor - game.totals.verified_cash_outs_minor;
  const next = NEXT_STATE[game.state];

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">{game.name}</h1>
        <span className="rounded bg-neutral-200 px-2 py-0.5 text-xs font-medium">{game.state}</span>
        <span className="rounded bg-neutral-200 px-2 py-0.5 text-xs" title="This game's currency — fixed once entries exist">
          {currency}
        </span>
        {(game.state === 'open' || game.state === 'running') && (
          <span className="num text-sm text-neutral-500">
            join code: <strong className="tracking-[0.2em]">{game.join_code}</strong>
          </span>
        )}
        {hostDetails && !isGuest && game.state !== 'closed' && (
          <Popover.Root>
            <Popover.Trigger className="rounded border border-neutral-300 px-2 py-1 text-xs text-neutral-600">
              Pay the host
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content className="z-10 w-80" sideOffset={6}>
                <PayoutBlock details={hostDetails} isGbp={currency === 'GBP'} title="Pay the host" />
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
        )}
        {isHost && next && (
          <button
            onClick={() => changeState.mutate(next.to)}
            className="ml-auto rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white"
          >
            {next.label}
          </button>
        )}
      </header>

      {conflict && (
        <p role="alert" className="mb-3 rounded bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {conflict}
        </p>
      )}

      <div className="mb-4 flex gap-6 text-sm">
        <span>
          Chips on the table:{' '}
          <strong>
            <Amount minor={game.totals.chips_on_table_minor} currency={currency} exponent={exponent} />
          </strong>
          <span className="ml-1 text-xs text-neutral-400">(includes pending)</span>
        </span>
        <span>
          Settleable:{' '}
          <strong>
            <Amount minor={settleableTable} currency={currency} exponent={exponent} />
          </strong>
          <span className="ml-1 text-xs text-neutral-400">(verified only)</span>
        </span>
        {game.totals.pending_count > 0 && (
          <span className="pending-figure text-sm">
            {game.totals.pending_count} claim{game.totals.pending_count > 1 ? 's' : ''} awaiting
            verification
          </span>
        )}
      </div>

      <div className="grid grid-cols-[3fr_2fr] gap-6">
        <div className="space-y-4">
          {(game.state === 'running' || game.state === 'settling') && (
            <div className="rounded border border-neutral-200 bg-white p-3">
              {entryFormOpen ? (
                <EntryForm
                  members={game.members}
                  currency={currency}
                  exponent={exponent}
                  defaultType={entryDefaults.type}
                  defaultUserId={entryDefaults.userId ?? meId ?? undefined}
                  allowedTypes={
                    game.state === 'settling' ? ['cash_out'] : ['buy_in', 'rebuy', 'cash_out']
                  }
                  canPickPlayer={isHost}
                  onSubmit={async (draft) => {
                    await logEntry.mutateAsync(draft);
                  }}
                  onCancel={() => setEntryFormOpen(false)}
                />
              ) : (
                <button
                  onClick={() => openEntryForm(game.state === 'settling' ? 'cash_out' : 'buy_in')}
                  className="text-sm text-neutral-500"
                >
                  Log an entry — <kbd className="rounded border px-1">n</kbd> buy-in,{' '}
                  <kbd className="rounded border px-1">r</kbd> rebuy,{' '}
                  <kbd className="rounded border px-1">c</kbd> cash-out
                </button>
              )}
            </div>
          )}

          <section aria-label="players">
            <LedgerTable game={game} selectedUserId={selectedUserId} onSelect={setSelectedUserId} />
          </section>

          <section>
            <h2 className="mb-1 text-xs font-medium uppercase tracking-wide text-neutral-500">
              Entry log
            </h2>
            {game.entries.length === 0 ? (
              <p className="text-sm text-neutral-500">
                No entries yet. Press <kbd className="rounded border px-1">n</kbd> to log the first
                buy-in.
              </p>
            ) : (
              <EntryLog
                game={game}
                meId={meId}
                isHost={isHost}
                onVerify={(entry) => verify.mutate(entry)}
                onReject={(entry) => reject.mutate({ entry, note: null })}
                onVoid={(entry, reason) => voidEntry.mutate({ entry, reason })}
                onAmend={(entry, amountMinor) => amend.mutate({ entry, amountMinor })}
              />
            )}
          </section>
        </div>

        <div className="space-y-4">
          {isHost && (game.state === 'running' || game.state === 'settling') && (
            <>
              {focusDetails && <PlayerBankCard details={focusDetails} isGbp={currency === 'GBP'} />}
              <section className="rounded border border-neutral-200 bg-white p-3">
                <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-500">
                  Verification queue
                </h2>
                <VerifyQueue
                  entries={game.entries}
                  nameOf={nameOf}
                  currency={currency}
                  exponent={exponent}
                  onVerify={(entry) => verify.mutate(entry)}
                  onReject={(entry, note) => reject.mutate({ entry, note })}
                  onSelect={onQueueSelect}
                  shortcutsEnabled={!entryFormOpen}
                />
              </section>
            </>
          )}

          {showSettlement && settlement && (
            <section className="rounded border border-neutral-200 bg-white p-3">
              <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-500">
                {settlement.final ? 'Settlement' : 'Settlement preview'}
              </h2>
              <SettlementPanel
                game={game}
                settlement={settlement}
                payoutDetails={isGuest ? null : (payoutDetails ?? null)}
                isHost={isHost}
                onClose={(acknowledge) => close.mutate(acknowledge)}
              />
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
