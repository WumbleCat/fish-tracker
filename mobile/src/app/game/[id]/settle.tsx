import { useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { ScrollView } from 'react-native';

import { SettleView } from '../../../components/SettleView';
import { closeGame } from '../../../lib/actions';
import { useAuth } from '../../../lib/auth';
import { useOnline } from '../../../lib/online';
import {
  useGame,
  useGamePayoutDetails,
  useGameRealtime,
  useMe,
  useSettlement,
} from '../../../lib/queries';

export default function SettleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();
  const { status, guest } = useAuth();
  const isGuestUser = status === 'guest';
  const { data: me } = useMe(!isGuestUser);
  const meId = isGuestUser ? (guest?.userId ?? null) : (me?.id ?? null);
  const { data: game } = useGame(id);
  useGameRealtime(id);
  const online = useOnline((s) => s.online);
  const { data: settlement, isError, isStale, refetch } = useSettlement(id);
  const { data: payoutDetails } = useGamePayoutDetails(id, !isGuestUser);

  if (!game || !settlement) return null;

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      <Stack.Screen options={{ title: settlement.final ? 'Settlement' : 'Settle up' }} />
      <SettleView
        game={game}
        settlement={settlement}
        payoutDetails={isGuestUser ? null : (payoutDetails ?? null)}
        isHost={!!meId && game.host_id === meId}
        stale={!online && (isError || isStale)}
        onClose={async (acknowledge) => {
          try {
            await closeGame(id!, acknowledge, game.version, online);
          } finally {
            void queryClient.invalidateQueries({ queryKey: ['game', id] });
            void refetch();
          }
        }}
      />
    </ScrollView>
  );
}
