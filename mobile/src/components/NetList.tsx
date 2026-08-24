/** The game screen's main content: name, live net, and — separately — a
 * pending chip. Sorted by net descending; people look to see who's up.
 * A player mid-game correctly shows their buy-ins in the red. */

import { View } from 'react-native';
import { Text } from './Text';

import { sortNetsDescending } from '../lib/ledger';
import type { Game } from '../lib/types';
import { AmountText, PendingChip } from './AmountText';

export function NetList({ game, meId }: { game: Game; meId: string | null }) {
  const nameOf = (id: string) =>
    game.members.find((m) => m.user_id === id)?.display_name ?? 'unknown';
  const isGuest = (id: string) => game.members.find((m) => m.user_id === id)?.is_guest;

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
    </View>
  );
}
