/** One dense row per player: buy-ins, rebuys, cash-out, live net, pending.
 * The net column is the API's settleable figure — verified only. Pending
 * sits beside it as a visibly provisional figure and never merges in. */

import type { Game } from '../lib/types';
import { Amount, PendingAmount } from './Amount';

export function LedgerTable({
  game,
  selectedUserId,
  onSelect,
  reconciling = false,
}: {
  game: Game;
  selectedUserId?: string | null;
  onSelect?: (userId: string) => void;
  /** A write is in flight: the figures shown are the server's last word and
   * will move when it answers — never before. */
  reconciling?: boolean;
}) {
  const { currency, currency_exponent: exponent } = game;
  const byUser = (userId: string) =>
    game.entries.filter((e) => e.user_id === userId && e.state === 'verified');

  return (
    // Six money columns do not fit a phone and must not be dropped — a
    // hidden column is a hidden figure. The table keeps every column and
    // scrolls within its own box; the page never scrolls sideways.
    <div className="overflow-x-auto">
    <table className="w-full min-w-[36rem] border-collapse text-sm" aria-label="ledger">
      <thead>
        <tr className="border-b border-neutral-300 text-left text-xs uppercase tracking-wide text-neutral-500">
          <th className="py-1.5 pr-2">Player</th>
          <th className="num px-2 py-1.5 text-right">Buy-ins</th>
          <th className="num px-2 py-1.5 text-right">Rebuys</th>
          <th className="num px-2 py-1.5 text-right">Cash-out</th>
          <th className="num px-2 py-1.5 text-right">Live net</th>
          <th className="px-2 py-1.5 text-right">Pending</th>
        </tr>
      </thead>
      <tbody>
        {game.members.map((member) => {
          const verified = byUser(member.user_id);
          const buyIns = verified
            .filter((e) => e.entry_type === 'buy_in')
            .reduce((sum, e) => sum + e.amount_minor, 0);
          const rebuys = verified
            .filter((e) => e.entry_type === 'rebuy')
            .reduce((sum, e) => sum + e.amount_minor, 0);
          const cashOut = verified
            .filter((e) => e.entry_type === 'cash_out')
            .reduce((sum, e) => sum + e.amount_minor, 0);
          const net = game.nets.find((n) => n.user_id === member.user_id);
          return (
            <tr
              key={member.user_id}
              aria-selected={selectedUserId === member.user_id}
              onClick={() => onSelect?.(member.user_id)}
              className={`border-b border-neutral-100 ${
                selectedUserId === member.user_id ? 'bg-emerald-50' : ''
              } ${member.departed_at ? 'text-neutral-400' : ''}`}
            >
              <td className="py-1.5 pr-2 font-medium">
                {member.display_name}
                {member.is_guest && <span className="ml-1 text-xs text-neutral-400">guest</span>}
                {member.role === 'host' && (
                  <span className="ml-1 text-xs text-emerald-700">host</span>
                )}
                {member.departed_unsettled && (
                  <span className="ml-1 text-xs text-amber-700">left unsettled</span>
                )}
              </td>
              <td className="px-2 py-1.5 text-right">
                <Amount minor={buyIns} currency={currency} exponent={exponent} />
              </td>
              <td className="px-2 py-1.5 text-right">
                <Amount minor={rebuys} currency={currency} exponent={exponent} />
              </td>
              <td className="px-2 py-1.5 text-right">
                <Amount minor={cashOut} currency={currency} exponent={exponent} />
              </td>
              <td className="px-2 py-1.5 text-right font-semibold">
                <Amount
                  minor={net?.settleable_minor ?? 0}
                  currency={currency}
                  exponent={exponent}
                  signed
                />
              </td>
              <td
                className={`px-2 py-1.5 text-right ${reconciling ? 'opacity-60' : ''}`}
                title={reconciling ? 'syncing — updates when the server confirms' : undefined}
              >
                <PendingAmount
                  minor={net?.pending_delta_minor ?? 0}
                  currency={currency}
                  exponent={exponent}
                />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
    </div>
  );
}
