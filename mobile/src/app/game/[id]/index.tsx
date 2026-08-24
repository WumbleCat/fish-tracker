/** The game screen: live nets, both totals, pending count, and one big
 * thumb-reachable entry button. Host actions live behind navigation — the
 * most-tapped area of the screen holds the safest action. */

import BottomSheet, { BottomSheetView } from '@gorhom/bottom-sheet';
import { useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Text } from '../../../components/Text';

import { AmountText } from '../../../components/AmountText';
import { EntrySheetContent } from '../../../components/EntrySheetContent';
import { NetList } from '../../../components/NetList';
import { OfflineBanner } from '../../../components/OfflineBanner';
import { api } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { confirmHaptic } from '../../../lib/haptics';
import { useOnline, sendQueuedEntry } from '../../../lib/online';
import { useGame, useGameRealtime, useMe } from '../../../lib/queries';
import { useEntryQueue } from '../../../lib/queue';
import type { EntryType } from '../../../lib/types';

function newClientKey(): string {
  // RFC4122-ish v4 from Math.random is fine for an idempotency key
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export default function GameScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();
  const { status, guest } = useAuth();
  const isGuestUser = status === 'guest';
  const { data: me } = useMe(!isGuestUser);
  const meId = isGuestUser ? (guest?.userId ?? null) : (me?.id ?? null);
  const { data: game } = useGame(id);
  useGameRealtime(id);
  const online = useOnline((s) => s.online);
  const { enqueue, flush, entries: queued } = useEntryQueue();
  const [lastAmount, setLastAmount] = useState<number | null>(null);
  const sheetRef = useRef<BottomSheet>(null);
  const snapPoints = useMemo(() => ['85%'], []);

  const isHost = !!game && !!meId && game.host_id === meId;
  const pendingCount = game?.totals.pending_count ?? 0;
  const myQueued = queued.filter((q) => q.gameId === id);

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['game', id] });
    void queryClient.invalidateQueries({ queryKey: ['settlement', id] });
  }, [queryClient, id]);

  const logEntry = useCallback(
    async (entryType: EntryType, amountMinor: number) => {
      sheetRef.current?.close();
      setLastAmount(amountMinor);
      const clientKey = newClientKey();
      confirmHaptic();
      if (!online) {
        // held locally in a distinct "not sent" state and flushed on reconnect
        enqueue({ clientKey, gameId: id!, entryType, amountMinor });
        return;
      }
      try {
        await api.logEntry(id!, {
          entry_type: entryType,
          amount_minor: amountMinor,
          client_key: clientKey,
        });
        invalidate();
      } catch (e: unknown) {
        const status_ = (e as { status?: number }).status;
        if (status_ && status_ >= 400 && status_ < 500) {
          invalidate(); // a domain refusal: show current truth
        } else {
          // network blinked mid-request: queue it; the client key makes the
          // replay safe even if the first attempt actually landed
          enqueue({ clientKey, gameId: id!, entryType, amountMinor });
          void flush(sendQueuedEntry);
        }
      }
    },
    [online, id, enqueue, flush, invalidate],
  );

  if (!game) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: '#9fb0a8' }}>Loading…</Text>
      </View>
    );
  }

  const { currency, currency_exponent: exponent } = game;
  const canLog = game.state === 'running' || game.state === 'settling';

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen
        options={{
          title: game.name,
          headerRight: () => (
            <Text style={{ color: '#9fb0a8', fontSize: 12 }}>
              {currency} · {game.state}
            </Text>
          ),
        }}
      />
      <OfflineBanner />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 120 }}>
        {(game.state === 'open' || game.state === 'running') && (
          <Text style={{ color: '#9fb0a8' }}>
            Join code:{' '}
            <Text style={{ color: '#e7ece9', fontWeight: '700', letterSpacing: 3 }}>
              {game.join_code}
            </Text>
          </Text>
        )}

        <View style={{ flexDirection: 'row', gap: 16 }}>
          <View>
            <Text style={{ color: '#9fb0a8', fontSize: 12 }}>CHIPS ON TABLE (incl. pending)</Text>
            <AmountText minor={game.totals.chips_on_table_minor} currency={currency} exponent={exponent} size={20} bold />
          </View>
          <View>
            <Text style={{ color: '#9fb0a8', fontSize: 12 }}>SETTLEABLE (verified)</Text>
            <AmountText
              minor={game.totals.verified_buy_ins_minor - game.totals.verified_cash_outs_minor}
              currency={currency}
              exponent={exponent}
              size={20}
              bold
            />
          </View>
        </View>

        {myQueued.length > 0 && (
          <View style={{ backgroundColor: 'rgba(251,191,36,0.1)', borderRadius: 10, padding: 10 }}>
            {myQueued.map((q) => (
              <Text key={q.clientKey} style={{ color: '#fbbf24', fontSize: 13 }}>
                not sent · {q.entryType.replace('_', '-')} —{' '}
                {q.failedCode ? `refused: ${q.failedCode.replaceAll('_', ' ')}` : 'will send when connected'}
              </Text>
            ))}
          </View>
        )}

        <NetList game={game} meId={meId} />

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {isHost && (
            <Pressable
              testID="verify-link"
              onPress={() => router.push(`/game/${id}/verify`)}
              style={{ minHeight: 44, justifyContent: 'center' }}
            >
              <Text style={{ color: '#34d399' }}>
                Verify queue{pendingCount ? ` (${pendingCount})` : ''} →
              </Text>
            </Pressable>
          )}
          <Pressable
            testID="entries-link"
            onPress={() => router.push(`/game/${id}/entries`)}
            style={{ minHeight: 44, justifyContent: 'center' }}
          >
            <Text style={{ color: '#9fb0a8' }}>My entries →</Text>
          </Pressable>
          {(game.state === 'settling' || game.state === 'closed') && (
            <Pressable
              testID="settle-link"
              onPress={() => router.push(`/game/${id}/settle`)}
              style={{ minHeight: 44, justifyContent: 'center' }}
            >
              <Text style={{ color: '#9fb0a8' }}>Settle →</Text>
            </Pressable>
          )}
          {isHost && canLog && (
            <Pressable
              onPress={async () => {
                const to = game.state === 'running' ? 'settling' : 'running';
                await api.changeState(id!, to, game.version).catch(() => {});
                invalidate();
              }}
              style={{ minHeight: 44, justifyContent: 'center' }}
            >
              <Text style={{ color: '#9fb0a8' }}>
                {game.state === 'running' ? 'Stop play & settle' : 'One more orbit'}
              </Text>
            </Pressable>
          )}
          {isHost && (game.state === 'draft' || game.state === 'open') && (
            <Pressable
              onPress={async () => {
                const to = game.state === 'draft' ? 'open' : 'running';
                await api.changeState(id!, to, game.version).catch(() => {});
                invalidate();
              }}
              style={{ minHeight: 44, justifyContent: 'center' }}
            >
              <Text style={{ color: '#34d399' }}>
                {game.state === 'draft' ? 'Open for joins' : 'Start game'}
              </Text>
            </Pressable>
          )}
        </View>

        {game.entries.length === 0 && canLog && (
          <Text style={{ color: '#9fb0a8' }}>
            No entries yet — log the first buy-in with the big button below.
          </Text>
        )}
      </ScrollView>

      {/* The persistent primary action: bottom, thumb-reachable, any phone. */}
      {canLog && (
        <Pressable
          testID="open-entry-sheet"
          onPress={() => sheetRef.current?.expand()}
          style={{
            position: 'absolute',
            bottom: 24,
            left: 16,
            right: 16,
            height: 64,
            borderRadius: 16,
            backgroundColor: '#059669',
            alignItems: 'center',
            justifyContent: 'center',
            shadowColor: '#000',
            shadowOpacity: 0.4,
            shadowRadius: 8,
            elevation: 6,
          }}
        >
          <Text style={{ color: '#fff', fontSize: 18, fontWeight: '800' }}>
            {game.state === 'settling' ? 'Log cash-out' : 'Log entry'}
          </Text>
        </Pressable>
      )}

      <BottomSheet
        ref={sheetRef}
        index={-1}
        snapPoints={snapPoints}
        enablePanDownToClose
        backgroundStyle={{ backgroundColor: '#111a16' }}
        handleIndicatorStyle={{ backgroundColor: '#5d6f66' }}
      >
        <BottomSheetView>
          <EntrySheetContent
            currency={currency}
            exponent={exponent}
            stakeMinor={game.stake_minor}
            lastAmountMinor={lastAmount}
            defaultType={game.state === 'settling' ? 'cash_out' : 'rebuy'}
            allowedTypes={game.state === 'settling' ? ['cash_out'] : ['buy_in', 'rebuy', 'cash_out']}
            onSubmit={logEntry}
          />
        </BottomSheetView>
      </BottomSheet>
    </View>
  );
}
