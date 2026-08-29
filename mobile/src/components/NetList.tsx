/** The game screen's main content: name, live net, and — separately — a
 * pending chip. Sorted by net descending; people look to see who's up.
 * A player mid-game correctly shows their buy-ins in the red.
 *
 * The foot adds the nets up and says what the total means: the sum of the
 * live nets is the reconciliation identity with its sign flipped, so mid-game
 * it is the chips still out and not a discrepancy. */

import { View } from 'react-native';
import { Text } from './Text';

import { sortNetsDescending, tableTotal } from '../lib/ledger';
import { fmtMinor } from '../lib/money';
import type { Game } from '../lib/types';
import { AmountText, PendingChip } from './AmountText';

export function NetList({ game, meId }: { game: Game; meId: string | null }) {
  const nameOf = (id: string) =>
    game.members.find((m) => m.user_id === id)?.display_name ?? 'unknown';
  const isGuest = (id: string) => game.members.find((m) => m.user_id === id)?.is_guest;
  const total = tableTotal(game.nets, game.entries);

  return (
    <View style={{ gap: 6 }}>
      {sortNetsDescending(game.nets).map((net) => (
        <View
          key={net.user_id}
          testID={`net-row-${net.user_id}`}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: net.user_id === meId ? '#1a2620' : '#111a16',
            borderRadius: 12,
            paddingHorizontal: 14,
            paddingVertical: 12,
            minHeight: 44,
            gap: 8,
          }}
        >
          <Text style={{ color: '#e7ece9', fontSize: 16, fontWeight: '600', flexShrink: 1 }}>
            {nameOf(net.user_id)}
            {net.user_id === game.host_id ? '  ♠ host' : ''}
            {isGuest(net.user_id) ? '  guest' : ''}
          </Text>
          <View style={{ flex: 1 }} />
          <PendingChip
            minor={net.pending_delta_minor}
            currency={game.currency}
            exponent={game.currency_exponent}
          />
          <AmountText
            minor={net.settleable_minor}
            currency={game.currency}
            exponent={game.currency_exponent}
            signed
            size={18}
            bold
          />
        </View>
      ))}

      <View
        testID="net-total"
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          borderTopWidth: 1,
          borderTopColor: '#2a3a33',
          paddingHorizontal: 14,
          paddingTop: 12,
          gap: 8,
        }}
      >
        <Text style={{ color: '#e7ece9', fontSize: 16, fontWeight: '700' }}>Total</Text>
        <View style={{ flex: 1 }} />
        <PendingChip
          minor={total.totalPendingMinor}
          currency={game.currency}
          exponent={game.currency_exponent}
        />
        <AmountText
          minor={total.totalNetMinor}
          currency={game.currency}
          exponent={game.currency_exponent}
          signed
          size={18}
          bold
        />
      </View>
      <Text
        testID="net-total-meaning"
        style={{
          color: total.status === 'gap' ? '#fbbf24' : total.status === 'balanced' ? '#34d399' : '#9fb0a8',
          fontSize: 12,
          paddingHorizontal: 14,
          textAlign: 'right',
        }}
      >
        {totalMeaning(total, game.currency, game.currency_exponent)}
      </Text>
    </View>
  );
}

/** Never "error": a table mid-game is meant to sum to the value of the chips
 * still out, and a real gap is a normal condition that needs a recount — in
 * the same words the settle screen uses. */
function totalMeaning(
  total: ReturnType<typeof tableTotal>,
  currency: string,
  exponent: number,
): string {
  const amount = fmtMinor(Math.abs(total.totalNetMinor), currency, exponent);
  if (total.status === 'in-play') {
    return `${amount} still on the table — ${
      total.playersInPlayCount === 1
        ? '1 player hasn’t cashed out'
        : `${total.playersInPlayCount} players haven’t cashed out`
    }`;
  }
  if (total.status === 'balanced') return '✓ balances — buy-ins and cash-outs agree';
  return `${amount} ${total.totalNetMinor < 0 ? 'short' : 'over'} — recount the chips`;
}
