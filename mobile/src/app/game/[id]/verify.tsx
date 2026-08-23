/** Host only: one pending entry at a time, oldest first. Offline, the
 * controls are disabled — verification is never queued. */

import { useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';

import { VerifyCard } from '../../../components/VerifyCard';
import { rejectEntry, verifyEntry } from '../../../lib/actions';
import { ApiError } from '../../../lib/api';
import { confirmHaptic, rejectHaptic } from '../../../lib/haptics';
import { pendingEntries } from '../../../lib/ledger';
import { useOnline } from '../../../lib/online';
import { useGame, useGameRealtime } from '../../../lib/queries';

export default function VerifyQueueScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();
  const { data: game } = useGame(id);
  useGameRealtime(id);
  const online = useOnline((s) => s.online);
  const [conflict, setConflict] = useState<string | null>(null);

  const queue = useMemo(() => (game ? pendingEntries(game.entries) : []), [game]);
  const current = queue[0];

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['game', id] });
    void queryClient.invalidateQueries({ queryKey: ['settlement', id] });
  };

  const handleError = (e: unknown) => {
    invalidate();
    if (e instanceof ApiError && e.code === 'version_conflict') {
      setConflict('That entry changed under you — showing the latest. Check it again.');
    } else if (e instanceof ApiError) {
      setConflict(`Refused: ${e.code.replaceAll('_', ' ')}`);
    }
    setTimeout(() => setConflict(null), 5000);
  };

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: `Verify (${queue.length})` }} />
      {conflict && (
        <Text style={{ color: '#fbbf24', padding: 12 }}>{conflict}</Text>
      )}
      {!current ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <Text style={{ color: '#9fb0a8', textAlign: 'center' }}>
            Nothing awaiting verification. New claims appear here the moment they're logged.
          </Text>
        </View>
      ) : (
        <VerifyCard
          key={current.id}
          entry={current}
          playerName={
            game?.members.find((m) => m.user_id === current.user_id)?.display_name ?? 'unknown'
          }
          currency={game?.currency ?? 'GBP'}
          exponent={game?.currency_exponent ?? 2}
          disabled={!online}
          disabledReason="You're offline — verification needs the live ledger."
          onVerify={async (entry) => {
            try {
              await verifyEntry(entry, online);
              confirmHaptic();
              invalidate();
            } catch (e) {
              handleError(e);
            }
          }}
          onReject={async (entry, note) => {
            try {
              await rejectEntry(entry, note, online);
              rejectHaptic();
              invalidate();
            } catch (e) {
              handleError(e);
            }
          }}
        />
      )}
    </View>
  );
}
