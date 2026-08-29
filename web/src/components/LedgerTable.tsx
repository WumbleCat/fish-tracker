/** One dense row per player: buy-ins, rebuys, cash-out, live net, pending.
 * The net column is the API's settleable figure — verified only. Pending
 * sits beside it as a visibly provisional figure and never merges in.
 *
 * The foot totals those columns and says what the total means, because the
 * sum of the live nets reads three different ways over a night: chips still
 * out, a table that balances, or the gap settlement will gate on. */

import { tableTotal } from '../lib/ledger';
import { fmtMinor } from '../lib/money';
import type { Game, Member } from '../lib/types';
import { Amount, PendingAmount } from './Amount';
import { isRemovable } from './RemovePlayer';

export function LedgerTable({
  game,
  selectedUserId,
  onSelect,
  reconciling = false,
  onRemove,
}: {
  game: Game;
  selectedUserId?: string | null;
  onSelect?: (userId: string) => void;
  /** A write is in flight: the figures shown are the server's last word and
   * will move when it answers — never before. */
  reconciling?: boolean;
  /** Host only, and only while the game can still change. Given, each seated
   * player who isn't the host gets a remove control on hover; the dialog it
   * opens is where the consequences are spelled out. */
  onRemove?: (member: Member) => void;
}) {
  const { currency, currency_exponent: exponent } = game;
  const byUser = (userId: string) =>
    game.entries.filter((e) => e.user_id === userId && e.state === 'verified');
  const total = tableTotal(game.nets, game.entries);
  const sumOf = (type: string) =>
    game.entries
      .filter((e) => e.state === 'verified' && e.entry_type === type)
      .reduce((sum, e) => sum + e.amount_minor, 0);

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
          {onRemove && <th className="w-8 px-2 py-1.5"><span className="sr-only">Seat</span></th>}
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
          const removable = !!onRemove && isRemovable(member, game.host_id);
          return (
            <tr
              key={member.user_id}
              aria-selected={selectedUserId === member.user_id}
              onClick={() => onSelect?.(member.user_id)}
              className={`group border-b border-neutral-100 ${
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
                {member.departed_at && !member.departed_unsettled && (
                  <span className="ml-1 text-xs text-neutral-400">left</span>
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
              {onRemove && (
                <td className="px-2 py-1.5 text-right">
                  {removable && (
                    // A hover affordance, not permanent furniture — but it
                    // stays reachable by keyboard, so focus reveals it too.
                    <button
                      type="button"
                      aria-label={`Remove ${member.display_name}`}
                      title={`Remove ${member.display_name} from the table`}
                      onClick={(e) => {
                        e.stopPropagation(); // selecting a row is not removing them
                        onRemove(member);
                      }}
                      className="rounded px-1 text-xs text-neutral-400 opacity-0 hover:bg-rose-50 hover:text-rose-700 focus:opacity-100 focus-visible:outline focus-visible:outline-1 group-hover:opacity-100"
                    >
                      Remove
                    </button>
                  )}
                </td>
              )}
            </tr>
          );
        })}
      </tbody>
      <tfoot>
        <tr className="border-t-2 border-neutral-300 font-semibold">
          <th scope="row" className="py-1.5 pr-2 text-left">
            Total
          </th>
          <td className="px-2 py-1.5 text-right">
            <Amount minor={sumOf('buy_in')} currency={currency} exponent={exponent} />
          </td>
          <td className="px-2 py-1.5 text-right">
            <Amount minor={sumOf('rebuy')} currency={currency} exponent={exponent} />
          </td>
          <td className="px-2 py-1.5 text-right">
            <Amount minor={sumOf('cash_out')} currency={currency} exponent={exponent} />
          </td>
          <td className="px-2 py-1.5 text-right" data-testid="total-live-net">
            <Amount
              minor={total.totalNetMinor}
              currency={currency}
              exponent={exponent}
              signed
            />
          </td>
          <td className={`px-2 py-1.5 text-right ${reconciling ? 'opacity-60' : ''}`}>
            <PendingAmount
              minor={total.totalPendingMinor}
              currency={currency}
              exponent={exponent}
            />
          </td>
          {onRemove && <td />}
        </tr>
        <tr>
          <td
            colSpan={onRemove ? 7 : 6}
            className="pb-1 text-right text-xs"
            data-testid="total-live-net-meaning"
          >
            <TotalMeaning total={total} currency={currency} exponent={exponent} />
          </td>
        </tr>
      </tfoot>
    </table>
    </div>
  );
}

/** What the number above it is a statement about. Never "error": a table
 * mid-game is meant to sum to the value of the chips still out, and a real
 * gap is a normal condition that needs a recount, in the same words the
 * settlement panel uses. */
function TotalMeaning({
  total,
  currency,
  exponent,
}: {
  total: ReturnType<typeof tableTotal>;
  currency: string;
  exponent: number;
}) {
  if (total.status === 'in-play') {
    return (
      <span className="text-neutral-500">
        {fmtMinor(Math.abs(total.totalNetMinor), currency, exponent)} still on the table —{' '}
        {total.playersInPlayCount === 1
          ? '1 player hasn’t cashed out'
          : `${total.playersInPlayCount} players haven’t cashed out`}
      </span>
    );
  }
  if (total.status === 'balanced') {
    return <span className="text-emerald-700">✓ balances — buy-ins and cash-outs agree</span>;
  }
  return (
    <span className="text-amber-800">
      {fmtMinor(Math.abs(total.totalNetMinor), currency, exponent)}{' '}
      {total.totalNetMinor < 0 ? 'short' : 'over'} — recount the chips, or log the missing entry
    </span>
  );
}
