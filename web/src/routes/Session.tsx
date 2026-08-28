/** The primary screen: ledger beside the running settlement, so the effect
 * of a verification is visible without navigating.
 *
 * Every click lands on screen synchronously and the server is asked in the
 * background — but the server always has the last word. Optimistic rows and
 * in-flight overlays live in local state and are merged at render; nets,
 * totals and settlement are only ever what the API last returned, marked
 * "syncing" until the refetch confirms. A refused write rolls back and says
 * exactly what was undone. */

import * as Popover from '@radix-ui/react-popover';
import { useIsMutating, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';

import { Amount } from '../components/Amount';
import { BlindsControl } from '../components/BlindsControl';
import { AddPlayer } from '../components/AddPlayer';
import { TransferHost } from '../components/TransferHost';
import { EntryForm, type EntryDraft } from '../components/EntryForm';
import { EntryLog } from '../components/EntryLog';
import { LedgerTable } from '../components/LedgerTable';
import { PayoutBlock } from '../components/PayoutBlock';
import { PlayerBankCard } from '../components/PlayerBankCard';
import { SettlementPanel } from '../components/SettlementPanel';
import { VerifyQueue } from '../components/VerifyQueue';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { fmtMinor, toDecimalString } from '../lib/money';
import {
  isOptimistic,
  mergeEntries,
  optimisticEntry,
  pruneOptimistic,
  undoMessage,
  type InFlight,
  type InFlightAction,
} from '../lib/optimistic';
import {
  useGame,
  useGamePayoutDetails,
  useGameRealtime,
  useMe,
  useSettlement,
} from '../lib/queries';
import { serialize } from '../lib/serialize';
import { useShortcuts } from '../lib/shortcuts';
import type { Entry, EntryType, Game, GameState, GameSummary } from '../lib/types';

const NEXT_STATE: Partial<Record<GameState, { to: GameState; label: string }>> = {
  draft: { to: 'open', label: 'Open for joins' },
  open: { to: 'running', label: 'Start game' },
  running: { to: 'settling', label: 'Stop play & settle' },
  settling: { to: 'running', label: 'One more orbit' },
};

interface Notice {
  text: string;
  /** A rolled-back entry can be put straight back into the form. */
  restore?: EntryDraft;
}

/** A table seats eleven, host included (app-logic, 2026-08-26). Display only —
 * the API refuses the twelfth. */
const MAX_SEATS = 11;

function CopyChip({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="rounded-full border border-neutral-300 px-2.5 py-0.5 text-xs text-neutral-600 hover:border-emerald-600 hover:text-emerald-700"
    >
      {copied ? 'Copied ✓' : label}
    </button>
  );
}

const reasonOf = (e: unknown): string => {
  if (e instanceof ApiError) {
    return e.code === 'version_conflict'
      ? 'it changed under you (showing the latest)'
      : e.code.replaceAll('_', ' ');
  }
  return 'network error';
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
  const [addPlayerOpen, setAddPlayerOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [entryDefaults, setEntryDefaults] = useState<{
    type: EntryType;
    userId?: string;
    amount?: string;
  }>({ type: 'buy_in' });
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [queueUserId, setQueueUserId] = useState<string | null>(null);
  const onQueueSelect = useCallback(
    (entry: Entry | null) => setQueueUserId(entry?.user_id ?? null),
    [],
  );

  // --- instant UI state: claims and overlays, never money ---------------
  const [optimistic, setOptimistic] = useState<Entry[]>([]);
  const [inflight, setInflight] = useState<InFlight>({});
  const [notice, setNotice] = useState<Notice | null>(null);
  const writesInFlight = useIsMutating({ mutationKey: ['game', id, 'write'] });

  // server rows replace optimistic ones as they land
  useEffect(() => {
    if (game) setOptimistic((rows) => pruneOptimistic(rows, game.entries));
  }, [game]);

  useEffect(() => {
    if (!notice || notice.restore) return;
    const timer = setTimeout(() => setNotice(null), 8000);
    return () => clearTimeout(timer);
  }, [notice]);

  const view = useMemo(
    () => (game ? { ...game, entries: mergeEntries(game.entries, optimistic) } : null),
    [game, optimistic],
  );

  const cancelReads = useCallback(async () => {
    // a stale response must not land on top of what the user just did
    await Promise.all([
      queryClient.cancelQueries({ queryKey: ['game', id] }),
      queryClient.cancelQueries({ queryKey: ['settlement', id] }),
    ]);
  }, [queryClient, id]);

  const reconcile = useCallback(
    async (entryId?: string) => {
      // refetch server truth; only once it has landed does the overlay come
      // off, so a row never flickers back to its old state in between
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['game', id] }),
        queryClient.invalidateQueries({ queryKey: ['settlement', id] }),
      ]);
      if (entryId) {
        setInflight((m) => {
          const { [entryId]: _gone, ...rest } = m;
          return rest;
        });
      }
    },
    [queryClient, id],
  );

  const describe = useCallback(
    (userId: string, amountMinor: number, entryType: EntryType | null) => {
      const g = queryClient.getQueryData<Game>(['game', id]);
      return {
        name: g?.members.find((m) => m.user_id === userId)?.display_name ?? 'unknown',
        amount: g ? fmtMinor(amountMinor, g.currency, g.currency_exponent) : String(amountMinor),
        entryType,
      };
    },
    [queryClient, id],
  );

  type LogVars = EntryDraft & { clientKey: string };
  const logEntry = useMutation({
    mutationKey: ['game', id, 'write'],
    mutationFn: (draft: LogVars) =>
      serialize(`game:${id}:log`, () =>
        api.logEntry(id!, {
          entry_type: draft.entryType,
          amount_minor: draft.amountMinor,
          client_key: draft.clientKey,
          ...(draft.userId !== meId ? { user_id: draft.userId } : {}),
        }),
      ),
    onMutate: async (draft) => {
      setOptimistic((rows) => [
        ...rows,
        optimisticEntry({
          clientKey: draft.clientKey,
          gameId: id!,
          userId: draft.userId,
          loggedBy: meId ?? draft.userId,
          entryType: draft.entryType,
          amountMinor: draft.amountMinor,
        }),
      ]);
      await cancelReads();
    },
    onError: (e, draft) => {
      setOptimistic((rows) => rows.filter((r) => r.client_key !== draft.clientKey));
      setNotice({
        text: undoMessage({
          action: 'log',
          ...describe(draft.userId, draft.amountMinor, draft.entryType),
          reason: reasonOf(e),
        }),
        restore: draft,
      });
    },
    onSettled: () => reconcile(),
  });

  // One shape for every per-entry action: overlay on, request serialised per
  // entry, overlay off only after the refetch, rollback with a specific message.
  const entryAction = <V extends { entry: Entry }>(
    action: InFlightAction,
    run: (vars: V) => Promise<unknown>,
    extra?: { onMutate?: (vars: V) => void; onError?: (vars: V) => void },
  ) => ({
    mutationKey: ['game', id, 'write'],
    mutationFn: (vars: V) => serialize(`entry:${vars.entry.id}`, () => run(vars)),
    onMutate: async (vars: V) => {
      setInflight((m) => ({ ...m, [vars.entry.id]: action }));
      extra?.onMutate?.(vars);
      await cancelReads();
    },
    onError: (e: unknown, vars: V) => {
      setInflight((m) => {
        const { [vars.entry.id]: _gone, ...rest } = m;
        return rest;
      });
      extra?.onError?.(vars);
      setNotice({
        text: undoMessage({
          action,
          ...describe(vars.entry.user_id, vars.entry.amount_minor, vars.entry.entry_type),
          reason: reasonOf(e),
        }),
      });
    },
    onSettled: (_data: unknown, _error: unknown, vars: V) => reconcile(vars.entry.id),
  });

  const verify = useMutation(
    entryAction<{ entry: Entry }>('verify', ({ entry }) => api.verify(entry.id, entry.version)),
  );
  const reject = useMutation(
    entryAction<{ entry: Entry; note: string | null }>('reject', ({ entry, note }) =>
      api.reject(entry.id, note ?? undefined, entry.version),
    ),
  );
  const voidEntry = useMutation(
    entryAction<{ entry: Entry; reason: string }>('void', ({ entry, reason }) =>
      api.voidEntry(entry.id, reason, entry.version),
    ),
  );
  const amend = useMutation(
    entryAction<{ entry: Entry; amountMinor: number; clientKey: string }>(
      'amend',
      ({ entry, amountMinor, clientKey }) =>
        api.amend(entry.id, amountMinor, entry.version, clientKey),
      {
        // the correction is a new pending row — shown at once under its key
        onMutate: ({ entry, amountMinor, clientKey }) =>
          setOptimistic((rows) => [
            ...rows,
            optimisticEntry({
              clientKey,
              gameId: id!,
              userId: entry.user_id,
              loggedBy: meId ?? entry.user_id,
              entryType: entry.entry_type,
              amountMinor,
              amendsEntryId: entry.id,
            }),
          ]),
        onError: ({ clientKey }) =>
          setOptimistic((rows) => rows.filter((r) => r.client_key !== clientKey)),
      },
    ),
  );

  // Blinds are the table's stakes, not ledger money: this is optimistic
  // because nothing downstream of it is a figure anyone is owed.
  const setBlinds = useMutation({
    mutationKey: ['game', id, 'write'],
    mutationFn: ({ small, big }: { small: number; big: number }) =>
      serialize(`game:${id}:blinds`, () =>
        api.setBlinds(id!, small, big, queryClient.getQueryData<Game>(['game', id])?.version),
      ),
    onMutate: async ({ small, big }) => {
      await cancelReads();
      const previous = queryClient.getQueryData<Game>(['game', id]);
      if (previous)
        queryClient.setQueryData<Game>(['game', id], {
          ...previous,
          small_blind_minor: small,
          big_blind_minor: big,
        });
      return { previous };
    },
    onError: (e, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(['game', id], ctx.previous);
      setNotice({ text: `Undid the blind change — ${reasonOf(e)}.` });
    },
    onSettled: () => reconcile(),
  });

  const changeState = useMutation({
    mutationKey: ['game', id, 'write'],
    mutationFn: (to: GameState) =>
      serialize(`game:${id}:state`, () =>
        api.changeState(id!, to, queryClient.getQueryData<Game>(['game', id])?.version),
      ),
    onMutate: async (to) => {
      await cancelReads();
      const previous = queryClient.getQueryData<Game>(['game', id]);
      if (previous)
        queryClient.setQueryData<Game>(['game', id], {
          ...previous,
          state: to,
        });
      return { previous };
    },
    onError: (e, to, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(['game', id], ctx.previous);
      setNotice({ text: `Undid state change to "${to}" — ${reasonOf(e)}.` });
    },
    onSettled: () => reconcile(),
  });

  /** Seating a player is never optimistic: the row is a server-issued
   * identity, and the host is about to log money against it. Nothing appears
   * at the table until the API says who they are. */
  const addPlayer = useMutation({
    mutationKey: ['game', id, 'write'],
    mutationFn: (displayName: string) =>
      serialize(`game:${id}:roster`, () => api.addPlayer(id!, displayName)),
    onMutate: () => ({
      seatedBefore: new Set(
        (queryClient.getQueryData<Game>(['game', id])?.members ?? []).map((m) => m.user_id),
      ),
    }),
    onSuccess: (next, _displayName, ctx) => {
      queryClient.setQueryData<Game>(['game', id], next);
      // the host seated them in order to log for them — go straight there,
      // with the new player already selected in the form
      const added = next.members.find((m) => !ctx?.seatedBefore.has(m.user_id));
      if (added && next.state === 'running') openEntryForm('buy_in', added.user_id);
    },
    onError: () => {
      // the dialog keeps the typed name and says what happened; nothing on
      // the table changed, so there is nothing to roll back
    },
    onSettled: () => reconcile(),
  });

  /** Handing over is never optimistic either: it decides who may verify, and
   * a client that guessed wrong would show verification controls to someone
   * the server has already demoted. */
  const transferHost = useMutation({
    mutationKey: ['game', id, 'write'],
    mutationFn: (userId: string) =>
      serialize(`game:${id}:roster`, () =>
        api.transferHost(id!, userId, queryClient.getQueryData<Game>(['game', id])?.version),
      ),
    onSuccess: (next) => {
      queryClient.setQueryData<Game>(['game', id], next);
      const name =
        next.members.find((m) => m.user_id === next.host_id)?.display_name ?? 'someone else';
      setNotice({ text: `${name} is the host now — you're a player at this table.` });
    },
    onSettled: () => reconcile(),
  });

  // Close is the one write that is NOT optimistic: it writes the settlement
  // snapshot people hand over cash against, so the screen shows the server's
  // answer and nothing sooner.
  const close = useMutation({
    mutationKey: ['game', id, 'write'],
    mutationFn: (acknowledge: boolean) =>
      serialize(`game:${id}:state`, () =>
        api.close(id!, acknowledge, queryClient.getQueryData<Game>(['game', id])?.version),
      ),
    onError: (e) => setNotice({ text: `Close refused — ${reasonOf(e)}.` }),
    onSettled: () => reconcile(),
  });

  // a second click while the first is still in flight is a no-op, not a race
  const act = (entry: Entry, run: () => void) => {
    if (inflight[entry.id] || isOptimistic(entry)) return;
    run();
  };

  const openEntryForm = useCallback((type: EntryType, userId?: string, amount?: string) => {
    setEntryDefaults({ type, userId, amount });
    setEntryFormOpen(true);
  }, []);

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
  // seating runs on its own enable rule: a table fills up while the game is
  // still `open`, where n/r/c would be logging money the API refuses
  const hostShortcuts = useMemo(() => ({ p: () => setAddPlayerOpen(true) }), []);
  useShortcuts(
    hostShortcuts,
    isHost && !!game && (game.state === 'open' || game.state === 'running'),
  );

  if (gameError instanceof ApiError && gameError.code === 'game_not_found') {
    return <p className="mt-16 text-center text-neutral-500">No such game, or you're not in it.</p>;
  }
  if (!view) {
    // shell first: whatever the sessions list already knows, then the data streams in
    const summary = queryClient.getQueryData<GameSummary[]>(['games'])?.find((g) => g.id === id);
    return (
      <div className="mx-auto max-w-6xl">
        <header className="mb-4 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold">{summary?.name ?? 'Loading game…'}</h1>
          {summary && (
            <>
              <span className="rounded bg-neutral-200 px-2 py-0.5 text-xs font-medium">
                {summary.state}
              </span>
              <span className="rounded bg-neutral-200 px-2 py-0.5 text-xs">{summary.currency}</span>
            </>
          )}
        </header>
        <p className="text-sm text-neutral-400">Loading entries…</p>
      </div>
    );
  }

  const shown = view;
  const { currency, currency_exponent: exponent } = shown;
  const nameOf = (userId: string) =>
    shown.members.find((m) => m.user_id === userId)?.display_name ?? 'unknown';
  const hostDetails = payoutDetails?.find((d) => d.user_id === shown.host_id) ?? null;
  // the player the host is acting on: the focused queue entry first, then
  // the ledger selection — whoever is about to be paid out
  const focusUserId = queueUserId ?? selectedUserId;
  const focusDetails =
    (focusUserId && payoutDetails?.find((d) => d.user_id === focusUserId)) || null;
  const settleableTable =
    shown.totals.verified_buy_ins_minor - shown.totals.verified_cash_outs_minor;
  const next = NEXT_STATE[shown.state];
  const syncing = writesInFlight > 0 || optimistic.length > 0 || Object.keys(inflight).length > 0;
  const seated = shown.members.filter((m) => !m.departed_at).length;
  const joinLink = `${window.location.origin}/join/${shown.join_code}`;

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">{shown.name}</h1>
        <span className="rounded bg-neutral-200 px-2 py-0.5 text-xs font-medium">
          {shown.state}
        </span>
        <span
          className="rounded bg-neutral-200 px-2 py-0.5 text-xs"
          title="This game's currency — fixed once entries exist"
        >
          {currency}
        </span>
        <span
          className="num rounded bg-neutral-200 px-2 py-0.5 text-xs"
          title="Seats taken — a table holds eleven, host included"
        >
          {seated}/{MAX_SEATS} seats
        </span>
        {isHost && (shown.state === 'draft' || shown.state === 'open' || shown.state === 'running') && (
          <AddPlayer
            open={addPlayerOpen}
            onOpenChange={setAddPlayerOpen}
            onAdd={(displayName) => addPlayer.mutateAsync(displayName)}
            disabledReason={
              shown.state === 'draft' ? 'Open the table first — a draft seats nobody' : undefined
            }
          />
        )}
        {isHost && shown.state !== 'closed' && shown.state !== 'abandoned' && (
          <TransferHost
            open={transferOpen}
            onOpenChange={setTransferOpen}
            members={shown.members}
            hostId={shown.host_id}
            onTransfer={(userId) => transferHost.mutateAsync(userId)}
          />
        )}
        <BlindsControl
          smallMinor={shown.small_blind_minor}
          bigMinor={shown.big_blind_minor}
          currency={currency}
          exponent={exponent}
          canEdit={isHost && shown.state !== 'closed' && shown.state !== 'abandoned'}
          onChange={(small, big) => setBlinds.mutate({ small, big })}
        />
        {(shown.state === 'open' || shown.state === 'running') && (
          <>
            <span className="num text-sm text-neutral-500">
              join code:{' '}
              <strong className="tracking-[0.2em] text-emerald-700">{shown.join_code}</strong>
            </span>
            <CopyChip label="Copy link" value={joinLink} />
            <CopyChip label="Copy code" value={shown.join_code} />
          </>
        )}
        {hostDetails && !isGuest && shown.state !== 'closed' && (
          <Popover.Root>
            <Popover.Trigger className="rounded border border-neutral-300 px-2 py-1 text-xs text-neutral-600">
              Pay the host
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content
                className="z-10 max-h-[70dvh] w-[min(20rem,calc(100vw-2rem))] overflow-y-auto"
                collisionPadding={16}
                sideOffset={6}
              >
                <PayoutBlock
                  details={hostDetails}
                  isGbp={currency === 'GBP'}
                  title="Pay the host"
                />
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

      {notice && (
        <p
          role="alert"
          className="mb-3 flex items-center gap-3 rounded bg-amber-50 px-3 py-2 text-sm text-amber-900"
        >
          <span>{notice.text}</span>
          {notice.restore && (
            <button
              onClick={() => {
                const r = notice.restore!;
                openEntryForm(
                  r.entryType,
                  r.userId,
                  toDecimalString(r.amountMinor, currency, exponent),
                );
                setNotice(null);
              }}
              className="rounded border border-amber-400 px-2 py-0.5 text-xs font-medium"
            >
              Restore to form
            </button>
          )}
          <button
            onClick={() => setNotice(null)}
            className="ml-auto text-xs underline"
            aria-label="dismiss"
          >
            dismiss
          </button>
        </p>
      )}

      <div className="mb-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
        <span>
          Chips on the table:{' '}
          <strong>
            <Amount
              minor={shown.totals.chips_on_table_minor}
              currency={currency}
              exponent={exponent}
            />
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
        {shown.totals.pending_count > 0 && (
          <span className="pending-figure text-sm">
            {shown.totals.pending_count} claim
            {shown.totals.pending_count > 1 ? 's' : ''} awaiting verification
          </span>
        )}
        {syncing && (
          <span
            className="text-xs text-neutral-400"
            aria-live="polite"
            title="Figures update when the server confirms"
          >
            syncing…
          </span>
        )}
      </div>

      {/* Ledger beside settlement is the desktop shape and stays that way
          from lg up. Below it the two stack: side by side on a phone gives
          the ledger a ~180px column, which no amount of inner scrolling
          rescues. min-w-0 on both children is what actually lets the
          tables inside scroll instead of forcing the grid wider. */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[3fr_2fr]">
        <div className="min-w-0 space-y-4">
          {(shown.state === 'running' || shown.state === 'settling') && (
            <div className="rounded border border-neutral-200 bg-white p-3">
              {entryFormOpen ? (
                <EntryForm
                  members={shown.members}
                  currency={currency}
                  exponent={exponent}
                  defaultType={entryDefaults.type}
                  defaultUserId={entryDefaults.userId ?? meId ?? undefined}
                  defaultAmount={entryDefaults.amount}
                  allowedTypes={
                    shown.state === 'settling' ? ['cash_out'] : ['buy_in', 'rebuy', 'cash_out']
                  }
                  canPickPlayer={isHost}
                  onSubmit={(draft) =>
                    logEntry.mutate({
                      ...draft,
                      clientKey: crypto.randomUUID(),
                    })
                  }
                  onCancel={() => setEntryFormOpen(false)}
                />
              ) : (
                <button
                  onClick={() => openEntryForm(shown.state === 'settling' ? 'cash_out' : 'buy_in')}
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
            <LedgerTable
              game={shown}
              selectedUserId={selectedUserId}
              onSelect={setSelectedUserId}
              reconciling={syncing}
            />
          </section>

          <section>
            <h2 className="mb-1 text-xs font-medium uppercase tracking-wide text-neutral-500">
              Entry log
            </h2>
            {shown.entries.length === 0 ? (
              // the dealt table: nothing has happened yet, and the two
              // things that can are right here
              <div className="flex flex-col gap-3.5 rounded-2xl border border-dashed border-felt-700 bg-felt-950 p-7 text-felt-100">
                <p className="text-[19px]">
                  {shown.state === 'running' || shown.state === 'settling'
                    ? "Nobody's bought in yet."
                    : shown.state === 'open'
                      ? 'Table is open — read the code out.'
                      : 'Nothing on the table yet.'}
                </p>
                <div className="flex flex-wrap gap-2.5">
                  {(shown.state === 'running' || shown.state === 'settling') && (
                    <button
                      onClick={() => openEntryForm('buy_in')}
                      className="rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white hover:brightness-105"
                    >
                      Log a buy-in
                    </button>
                  )}
                  {(shown.state === 'open' || shown.state === 'running') && (
                    <button
                      onClick={() => void navigator.clipboard.writeText(joinLink)}
                      className="rounded-full border border-felt-700 px-5 py-2.5 text-sm text-felt-300 hover:border-emerald-400"
                    >
                      Copy link
                    </button>
                  )}
                </div>
                <p className="text-[12.5px] text-felt-600">n logs · r rebuy · c cash out</p>
              </div>
            ) : (
              <EntryLog
                game={shown}
                meId={meId}
                isHost={isHost}
                inflight={inflight}
                onVerify={(entry) => act(entry, () => verify.mutate({ entry }))}
                onReject={(entry) => act(entry, () => reject.mutate({ entry, note: null }))}
                onVoid={(entry, reason) => act(entry, () => voidEntry.mutate({ entry, reason }))}
                onAmend={(entry, amountMinor) =>
                  act(entry, () =>
                    amend.mutate({
                      entry,
                      amountMinor,
                      clientKey: crypto.randomUUID(),
                    }),
                  )
                }
              />
            )}
          </section>
        </div>

        <div className="min-w-0 space-y-4">
          {isHost && (shown.state === 'running' || shown.state === 'settling') && (
            <>
              {focusDetails && <PlayerBankCard details={focusDetails} isGbp={currency === 'GBP'} />}
              <section className="rounded border border-neutral-200 bg-white p-3">
                <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-500">
                  Verification queue
                </h2>
                <VerifyQueue
                  entries={shown.entries}
                  inflight={inflight}
                  nameOf={nameOf}
                  currency={currency}
                  exponent={exponent}
                  onVerify={(entry) => act(entry, () => verify.mutate({ entry }))}
                  onReject={(entry, note) => act(entry, () => reject.mutate({ entry, note }))}
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
                game={shown}
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
