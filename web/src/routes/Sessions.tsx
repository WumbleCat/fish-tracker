import * as Dialog from '@radix-ui/react-dialog';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { api } from '../lib/api';
import { prefetchGame, useMe, useGames } from '../lib/queries';
import { useShortcuts } from '../lib/shortcuts';

const STATE_LABELS: Record<string, string> = {
  draft: 'draft',
  open: 'open for joins',
  running: 'running',
  settling: 'settling',
  closed: 'closed',
  abandoned: 'abandoned',
};

export function Sessions() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: games } = useGames();
  const { data: me } = useMe(true);
  const [search, setSearch] = useState('');
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
  const joinMutation = useMutation({
    mutationFn: () => api.joinGame(joinCode.toUpperCase()),
    onSuccess: (game) => navigate(`/session/${game.id}`),
  });

  const filtered = useMemo(
    () =>
      (games ?? []).filter((g) => g.name.toLowerCase().includes(search.toLowerCase())),
    [games, search],
  );

  useShortcuts({
    n: () => setCreateOpen(true),
    '/': () => searchRef.current?.focus(),
  });

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-4 flex items-center gap-3">
        <h1 className="text-xl font-semibold">Sessions</h1>
        <input
          ref={searchRef}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search  ( / )"
          className="ml-auto w-56 rounded border border-neutral-300 px-3 py-1.5 text-sm"
        />
        <button
          onClick={() => setJoinOpen(true)}
          className="rounded border border-neutral-300 px-3 py-1.5 text-sm"
        >
          Join by code
        </button>
        <button
          onClick={() => setCreateOpen(true)}
          className="rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white"
        >
          New game (n)
        </button>
      </div>

      {games && games.length === 0 && (
        <p className="rounded border border-dashed border-neutral-300 p-8 text-center text-neutral-500">
          No sessions yet — start one and read the join code out at the table.
        </p>
      )}

      {filtered.length > 0 && (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-300 text-left text-xs uppercase tracking-wide text-neutral-500">
              <th className="py-2">Game</th>
              <th className="py-2">Date</th>
              <th className="py-2">Currency</th>
              <th className="py-2">State</th>
              <th className="py-2">Your role</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((g) => (
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
      )}

      <Dialog.Root open={createOpen} onOpenChange={setCreateOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/30" />
          <Dialog.Content className="fixed left-1/2 top-1/3 w-96 -translate-x-1/2 rounded-lg bg-white p-4 shadow-xl">
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
                className="w-full rounded border border-neutral-300 px-3 py-2 text-sm"
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
          <Dialog.Content className="fixed left-1/2 top-1/3 w-96 -translate-x-1/2 rounded-lg bg-white p-4 shadow-xl">
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
                  Couldn't join with that code.
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
