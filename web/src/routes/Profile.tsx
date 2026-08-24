/** Lifetime record: totals per currency (never summed across them), the
 * tables this player hosted, and every table they sat at with their own
 * buy-ins and cash-outs. All money is the API's — verified entries only;
 * a pending claim is listed, never counted. */

import { format } from 'date-fns';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { Amount } from '../components/Amount';
import { fmtMinor } from '../lib/money';
import { useHistory, useMe, useMyGames } from '../lib/queries';
import type { GameHistory } from '../lib/types';

const STATE_STYLES: Record<string, string> = {
  pending: 'text-amber-700 bg-amber-50',
  verified: 'text-emerald-700 bg-emerald-50',
  rejected: 'text-rose-700 bg-rose-50',
  void: 'text-neutral-400 bg-neutral-100 line-through',
};

function TableRow({ g }: { g: GameHistory }) {
  return (
    <details className="group border-b border-neutral-100">
      <summary className="grid cursor-pointer grid-cols-[1fr_auto_auto_auto_auto_auto] items-center gap-4 py-2 text-sm hover:bg-neutral-100/60">
        <span>
          <span className="font-medium">{g.name}</span>
          {g.hosted && <span className="ml-1 text-xs text-emerald-700">hosted</span>}
          <span className="ml-2 text-xs text-neutral-400">{g.state}</span>
        </span>
        <span className="num text-neutral-500">{format(new Date(g.created_at), 'd MMM yyyy')}</span>
        <span className="num w-20 text-right">
          <Amount minor={g.buy_ins_minor} currency={g.currency} exponent={g.currency_exponent} />
        </span>
        <span className="num w-20 text-right">
          <Amount minor={g.cash_outs_minor} currency={g.currency} exponent={g.currency_exponent} />
        </span>
        <span className="num w-20 text-right font-semibold">
          <Amount minor={g.net_minor} currency={g.currency} exponent={g.currency_exponent} signed />
        </span>
        <span className="text-xs text-neutral-400 group-open:hidden">{g.entries.length} entries</span>
        <span className="hidden text-xs text-neutral-400 group-open:inline">hide</span>
      </summary>
      {g.entries.length === 0 ? (
        <p className="pb-2 pl-4 text-xs text-neutral-400">No entries of yours at this table.</p>
      ) : (
        <ul className="mb-2 ml-4 divide-y divide-neutral-100 rounded border border-neutral-200 bg-white text-xs">
          {g.entries.map((e) => (
            <li key={e.id} className="flex items-center gap-3 px-2 py-1">
              <span className="num w-14 text-neutral-500">
                {format(new Date(e.created_at), 'HH:mm')}
              </span>
              <span className="w-16">{e.entry_type.replace('_', '-')}</span>
              <span className="num w-20 text-right">
                <Amount minor={e.amount_minor} currency={g.currency} exponent={g.currency_exponent} />
              </span>
              <span className={`rounded px-1.5 py-0.5 ${STATE_STYLES[e.state]}`}>{e.state}</span>
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}

export function Profile() {
  const { data: me } = useMe(true);
  const { data: history } = useHistory(true);
  const { data: myGames } = useMyGames(true);

  const games = myGames?.games ?? [];
  const hosted = games.filter((g) => g.hosted);
  const closed = games.filter((g) => g.state === 'closed');

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-xl font-semibold">{me?.display_name}</h1>
      <p className="text-sm text-neutral-500">
        {games.length} table{games.length === 1 ? '' : 's'} sat at · {hosted.length} hosted ·{' '}
        {closed.length} closed
      </p>

      {history?.currencies.length === 0 && games.length === 0 && (
        <p className="mt-8 rounded border border-dashed border-neutral-300 p-8 text-center text-neutral-500">
          Finish a game and your lifetime record starts here.
        </p>
      )}

      {history?.currencies.map((c) => {
        // cumulative net over this currency's closed tables, oldest first
        let running = 0;
        const series = closed
          .filter((g) => g.currency === c.currency)
          .slice()
          .reverse()
          .map((g, i) => {
            running += g.net_minor;
            return { session: i + 1, name: g.name, net: running };
          });
        return (
          <section key={c.currency} className="mt-6 rounded border border-neutral-200 bg-white p-4">
            <h2 className="text-sm font-semibold">{c.currency}</h2>
            <dl className="mt-2 grid grid-cols-4 gap-4 text-sm">
              <div>
                <dt className="text-xs text-neutral-500">Sessions</dt>
                <dd className="num text-lg">{c.games_played}</dd>
              </div>
              <div>
                <dt className="text-xs text-neutral-500">Total buy-ins</dt>
                <dd className="num text-lg">
                  <Amount minor={c.total_buy_ins_minor} currency={c.currency} exponent={c.currency_exponent} />
                </dd>
              </div>
              <div>
                <dt className="text-xs text-neutral-500">Total cash-outs</dt>
                <dd className="num text-lg">
                  <Amount minor={c.total_cash_outs_minor} currency={c.currency} exponent={c.currency_exponent} />
                </dd>
              </div>
              <div>
                <dt className="text-xs text-neutral-500">Lifetime net</dt>
                <dd className="num text-lg font-semibold">
                  <Amount minor={c.net_minor} currency={c.currency} exponent={c.currency_exponent} signed />
                </dd>
              </div>
            </dl>
            {c.adjustments_minor !== 0 && (
              <p className="mt-2 text-xs text-neutral-500">
                Plus post-close adjustments:{' '}
                <Amount minor={c.adjustments_minor} currency={c.currency} exponent={c.currency_exponent} signed />{' '}
                (recorded beside the original settlements, which stand unchanged)
              </p>
            )}
            {series.length > 1 && (
              <div className="mt-4 h-40">
                <ResponsiveContainer>
                  <LineChart data={series}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="session" fontSize={11} />
                    <YAxis
                      fontSize={11}
                      tickFormatter={(v: number) => fmtMinor(v, c.currency, c.currency_exponent)}
                    />
                    <Tooltip
                      formatter={(v: number) => fmtMinor(v, c.currency, c.currency_exponent)}
                      labelFormatter={(_l, payload) => payload?.[0]?.payload?.name ?? ''}
                    />
                    <Line type="monotone" dataKey="net" stroke="#047857" dot />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </section>
        );
      })}

      {hosted.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-1 text-xs font-medium uppercase tracking-wide text-neutral-500">
            Tables hosted
          </h2>
          <ul className="divide-y divide-neutral-100 rounded border border-neutral-200 bg-white px-3 text-sm">
            {hosted.map((g) => (
              <li key={g.game_id} className="flex items-center gap-4 py-2">
                <span className="font-medium">{g.name}</span>
                <span className="num text-neutral-500">{format(new Date(g.created_at), 'EEE d MMM yyyy')}</span>
                <span className="text-xs text-neutral-400">{g.state}</span>
                <span className="num ml-auto">
                  <Amount minor={g.net_minor} currency={g.currency} exponent={g.currency_exponent} signed />
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {games.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-1 text-xs font-medium uppercase tracking-wide text-neutral-500">
            Every table — your buy-ins and cash-outs
          </h2>
          <div className="rounded border border-neutral-200 bg-white px-3">
            <div className="grid grid-cols-[1fr_auto_auto_auto_auto_auto] gap-4 border-b border-neutral-300 py-1.5 text-xs uppercase tracking-wide text-neutral-500">
              <span>Table</span>
              <span>Date</span>
              <span className="w-20 text-right">Buy-ins</span>
              <span className="w-20 text-right">Cash-outs</span>
              <span className="w-20 text-right">Net</span>
              <span />
            </div>
            {games.map((g) => (
              <TableRow key={g.game_id} g={g} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
