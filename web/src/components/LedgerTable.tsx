/** One dense row per player: buy-ins, rebuys, cash-out, live net, pending.
 * The net column is the API's settleable figure — verified only. Pending
 * sits beside it as a visibly provisional figure and never merges in.
 * A player's name opens their profile: the bank details they've shared
 * with this table (masked, reveal on demand). */

import * as Popover from '@radix-ui/react-popover';

import type { Game, PayoutDetailsMasked } from '../lib/types';
import { Amount, PendingAmount } from './Amount';
import { PayoutBlock } from './PayoutBlock';

export function LedgerTable({
  game,
  selectedUserId,
  onSelect,
  reconciling = false,
  payoutDetails = null,
}: {
  game: Game;
  selectedUserId?: string | null;
  onSelect?: (userId: string) => void;
  /** A write is in flight: the figures shown are the server's last word and
   * will move when it answers — never before. */
  reconciling?: boolean;
  /** What each player has shared with this table; a name with none is just a name. */
  payoutDetails?: PayoutDetailsMasked[] | null;
}) {
  const { currency, currency_exponent: exponent } = game;
  const byUser = (userId: string) =>
    game.entries.filter((e) => e.user_id === userId && e.state === 'verified');
  const detailFor = (userId: string) => payoutDetails?.find((d) => d.user_id === userId) ?? null;

  return (
    <table className="w-full border-collapse text-sm" aria-label="ledger">
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
          const details = detailFor(member.user_id);
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
                {details ? (
                  <Popover.Root>
                    <Popover.Trigger
                      onClick={(e) => e.stopPropagation()}
                      className="underline decoration-dotted underline-offset-2 hover:text-emerald-700"
                      aria-label={`profile: ${member.display_name}`}
                    >
                      {member.display_name}
                    </Popover.Trigger>
                    <Popover.Portal>
                      <Popover.Content className="z-10 w-80" sideOffset={6} align="start">
                        <PayoutBlock
                          details={details}
                          isGbp={currency === 'GBP'}
                          title={`Pay ${member.display_name}`}
                        />
                      </Popover.Content>
                    </Popover.Portal>
                  </Popover.Root>
                ) : (
                  member.display_name
                )}
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
  );
}
