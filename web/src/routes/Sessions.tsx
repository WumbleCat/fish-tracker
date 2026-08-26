import * as Dialog from '@radix-ui/react-dialog';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { api } from '../lib/api';
import { prefetchGame, useMe, useGames } from '../lib/queries';
import { DEFAULT_SORT, nextSort, sortGames, type Sort, type SortKey } from '../lib/sessionSort';
import { useShortcuts } from '../lib/shortcuts';
import { joinErrorMessage } from './Landing';

const STATE_LABELS: Record<string, string> = {
  draft: 'draft',
  open: 'open for joins',
  running: 'running',
  settling: 'settling',
  closed: 'closed',
  abandoned: 'abandoned',
};

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'name', label: 'Game' },
  { key: 'created_at', label: 'Date' },
  { key: 'currency', label: 'Currency' },
  { key: 'state', label: 'State' },
  { key: 'role', label: 'Your role' },
];

export function Sessions() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: games } = useGames();
  const { data: me } = useMe(true);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<Sort>(DEFAULT_SORT);
  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [name, setName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  const createMutation = useMutation({
    mutationFn: () =>
      api.createGame({ name, currency: me?.default_currency ?? 'GBP' }),
    onSuccess: (game) => {
      void queryClient.invalidateQueries({ queryKey: ['games'] });
      navigate(`/session/${game.id}`);
    },
  });
  // First game: name it and open the table in one go — the code is what
  // the host needs next, and it's on the session screen.
  const openTable = useMutation({
    mutationFn: async () => {
      const game = await api.createGame({ name, currency: me?.default_currency ?? 'GBP' });
      return api.changeState(game.id, 'open', game.version);
    },
    onSuccess: (game) => {
      void queryClient.invalidateQueries({ queryKey: ['games'] });
      navigate(`/session/${game.id}`);
    },
  });
  const joinMutation = useMutation({
    mutationFn: () => api.joinGame(joinCode.toUpperCase()),
    onSuccess: (game) => navigate(`/session/${game.id}`),
  });

  const filtered = useMemo(
    () =>
      (games ?? []).filter((g) => g.name.toLowerCase().includes(search.toLowerCase())),
    [games, search],
  );
  const rows = useMemo(() => sortGames(filtered, sort), [filtered, sort]);

  useShortcuts({
    n: () => setCreateOpen(true),
    '/': () => searchRef.current?.focus(),
  });

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2">
        {/* the heading takes its own line on a phone so the two buttons stay
            on one line together rather than splitting across the wrap */}
        <h1 className="w-full text-xl font-semibold sm:w-auto">Sessions</h1>
        {/* full width on its own line below sm, then back to the right-hand
            end of the title row — a 224px field cannot share 320px with two
            buttons and a heading */}
        <input
          ref={searchRef}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search  ( / )"
          className="order-last w-full rounded border border-neutral-300 px-3 py-1.5 text-base sm:order-none sm:ml-auto sm:w-56 sm:text-sm"
        />
        <button
          onClick={() => setJoinOpen(true)}
          className="min-h-11 rounded border border-neutral-300 px-3 py-1.5 text-sm sm:min-h-0"
        >
          Join by code
        </button>
        <button
          onClick={() => setCreateOpen(true)}
          className="min-h-11 rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white sm:min-h-0"
        >
          New game (n)
        </button>
      </div>

      {games && games.length === 0 && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim() && !openTable.isPending) openTable.mutate();
          }}
          aria-label="host your first game"
          className="mx-auto max-w-sm rounded-2xl border border-felt-700 bg-felt-950 p-5 text-felt-100"
        >
          <p className="mb-3 font-mono text-[10px] font-semibold tracking-[0.12em] text-felt-600">
            HOST, FIRST GAME
          </p>
          <div className="flex flex-col gap-2.5 text-sm">
            <label className="flex items-center justify-between gap-3 text-felt-300">
              Name
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Friday at mine"
                className="w-44 min-w-0 rounded-lg border border-felt-700 bg-white/5 px-3 py-1.5 text-right text-base text-felt-100 placeholder:text-felt-600 focus:border-emerald-400 focus:outline-none sm:text-sm"
                aria-label="game name"
              />
            </label>
            <div className="flex justify-between text-felt-300">
              <span>Currency</span>
              <span className="num text-felt-100">{me?.default_currency ?? 'GBP'}</span>
            </div>
            <div className="flex justify-between text-felt-300">
              <span>Seats</span>
              <span className="num text-felt-100">11</span>
            </div>
          </div>
          {openTable.isError && (
            <p role="alert" className="mt-3 text-xs text-rose-400">
              Couldn't open the table — try again.
            </p>
          )}
          <button
            type="submit"
            className="mt-4 h-12 w-full rounded-full bg-emerald-600 text-[15px] font-bold text-white hover:brightness-105"
          >
            Open the table
          </button>
          <p className="mt-3 text-xs text-felt-600">
            Players are seated as they join. Nothing else to set up.
          </p>
        </form>
      )}

      {rows.length > 0 && (
        // the table keeps its columns and scrolls inside this box; the page
        // itself never scrolls sideways
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <table className="w-full min-w-[34rem] text-sm">
          <thead>
            <tr className="border-b border-neutral-300 text-left text-xs uppercase tracking-wide text-neutral-500">
              {COLUMNS.map(({ key, label }) => {
                const active = sort.key === key;
                return (
                  <th
                    key={key}
                    scope="col"
                    className="py-2"
                    aria-sort={
                      active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'
                    }
                  >
                    <button
                      type="button"
                      onClick={() => setSort((s) => nextSort(s, key))}
                      className="-mx-1 flex items-center gap-1 rounded px-1 uppercase tracking-wide hover:text-neutral-900"
                    >
                      {label}
                      {/* the arrow, not the colour, is what says which way
                          this column is running */}
                      <span aria-hidden className={active ? '' : 'text-neutral-300'}>
                        {active ? (sort.dir === 'asc' ? '▲' : '▼') : '↕'}
                      </span>
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((g) => (
              <tr
                key={g.id}
                className="border-b border-neutral-100 hover:bg-neutral-100/60"
                onMouseEnter={() => prefetchGame(queryClient, g.id)}
              >
                <td className="py-2">
                  <Link
                    to={`/session/${g.id}`}
                    onFocus={() => prefetchGame(queryClient, g.id)}
                    className="font-medium text-emerald-800"
                  >
                    {g.name}
                  </Link>
                </td>
                <td className="num py-2">{format(new Date(g.created_at), 'EEE d MMM yyyy')}</td>
                <td className="py-2">{g.currency}</td>
                <td className="py-2">{STATE_LABELS[g.state]}</td>
                <td className="py-2">{g.role}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}

      <Dialog.Root open={createOpen} onOpenChange={setCreateOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/30" />
          <Dialog.Content className="fixed left-1/2 top-1/3 max-h-[calc(100dvh-6rem)] w-[min(24rem,calc(100vw-2rem))] -translate-x-1/2 overflow-y-auto rounded-lg bg-white p-4 shadow-xl">
            <Dialog.Title className="text-sm font-semibold">New game</Dialog.Title>
            <Dialog.Description className="sr-only">Create a new game</Dialog.Description>
            <form
              className="mt-3 space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (name.trim()) createMutation.mutate();
              }}
            >
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={`e.g. Friday at ${me?.display_name ?? 'mine'}'s`}
                className="w-full rounded border border-neutral-300 px-3 py-2 text-base sm:text-sm"
              />
              <p className="text-xs text-neutral-500">
                Currency: {me?.default_currency ?? 'GBP'} (your default — changeable until the
                first entry is logged)
              </p>
              <button
                type="submit"
                className="w-full rounded bg-neutral-900 px-3 py-2 text-sm font-medium text-white"
              >
                Create
              </button>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root open={joinOpen} onOpenChange={setJoinOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/30" />
          <Dialog.Content className="fixed left-1/2 top-1/3 max-h-[calc(100dvh-6rem)] w-[min(24rem,calc(100vw-2rem))] -translate-x-1/2 overflow-y-auto rounded-lg bg-white p-4 shadow-xl">
            <Dialog.Title className="text-sm font-semibold">Join a game</Dialog.Title>
            <Dialog.Description className="sr-only">Join a game by code</Dialog.Description>
            <form
              className="mt-3 space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                joinMutation.mutate();
              }}
            >
              <input
                autoFocus
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder="Code"
                maxLength={6}
                className="num w-full rounded border border-neutral-300 px-3 py-2 text-center text-lg uppercase tracking-[0.3em]"
              />
              {joinMutation.isError && (
                <p role="alert" className="text-sm text-rose-700">
                  {joinErrorMessage(joinMutation.error)}
                </p>
              )}
              <button
                type="submit"
                className="w-full rounded bg-neutral-900 px-3 py-2 text-sm font-medium text-white"
              >
                Join
              </button>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
