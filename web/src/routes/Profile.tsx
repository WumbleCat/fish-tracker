/** Lifetime stats, grouped per currency — never summed across them. */

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
import { useGames, useHistory, useMe } from '../lib/queries';

export function Profile() {
  const { data: me } = useMe(true);
  const { data: history } = useHistory(true);
  const { data: games } = useGames();

  const closedGames = (games ?? []).filter((g) => g.state === 'closed');

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-xl font-semibold">{me?.display_name}</h1>
      <p className="text-sm text-neutral-500">{closedGames.length} closed sessions on record</p>

      {history?.currencies.length === 0 && (
        <p className="mt-8 rounded border border-dashed border-neutral-300 p-8 text-center text-neutral-500">
          Finish a game and your lifetime record starts here.
        </p>
      )}

      {history?.currencies.map((c) => (
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
              <Amount
                minor={c.adjustments_minor}
                currency={c.currency}
                exponent={c.currency_exponent}
                signed
              />{' '}
              (recorded beside the original settlements, which stand unchanged)
            </p>
          )}
          {closedGames.filter((g) => g.currency === c.currency).length > 1 && (
            <div className="mt-4 h-40">
              <ResponsiveContainer>
                <LineChart
                  data={closedGames
                    .filter((g) => g.currency === c.currency)
                    .map((g, i) => ({ name: g.name, session: i + 1 }))}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="session" fontSize={11} />
                  <YAxis
                    fontSize={11}
                    tickFormatter={(v: number) => fmtMinor(v, c.currency, c.currency_exponent)}
                  />
                  <Tooltip />
                  <Line type="monotone" dataKey="net" stroke="#047857" dot />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
