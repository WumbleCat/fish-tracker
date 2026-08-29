/** The game screen: live nets, both totals, pending count, and one big
 * thumb-reachable entry button. Host actions live behind navigation — the
 * most-tapped area of the screen holds the safest action. */

import BottomSheet, { BottomSheetView } from '@gorhom/bottom-sheet';
import { useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, TextInput, View } from 'react-native';
import { Text } from '../../../components/Text';

import { AmountText } from '../../../components/AmountText';
import { BlindsRow } from '../../../components/BlindsRow';
import { EntrySheetContent } from '../../../components/EntrySheetContent';
import { HandOverHost } from '../../../components/HandOverHost';
import { NetList } from '../../../components/NetList';
import { RemovePlayer } from '../../../components/RemovePlayer';
import { OfflineBanner } from '../../../components/OfflineBanner';
import { api } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { confirmHaptic } from '../../../lib/haptics';
import { useOnline, sendQueuedEntry } from '../../../lib/online';
import { useGame, useGameRealtime, useMe } from '../../../lib/queries';
import { useEntryQueue } from '../../../lib/queue';
import { hasBoughtIn } from '../../../lib/ledger';
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
  // who the sheet opens for: null is "me", a user id is the host logging on
  // a seated player's behalf
  const [sheetTarget, setSheetTarget] = useState<string | null>(null);
  // which entry the button that opened the sheet was for; the sheet still
  // lets it be changed, this only decides what it opens on
  const [sheetType, setSheetType] = useState<EntryType>('buy_in');
  const [addOpen, setAddOpen] = useState(false);
  const [addName, setAddName] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [handOverOpen, setHandOverOpen] = useState(false);
  const [handingOver, setHandingOver] = useState(false);
  const [handOverError, setHandOverError] = useState<string | null>(null);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const sheetRef = useRef<BottomSheet>(null);
  const snapPoints = useMemo(() => ['85%'], []);

  const isHost = !!game && !!meId && game.host_id === meId;
  const seated = useMemo(
    () => (game?.members ?? []).filter((m) => !m.departed_at),
    [game],
  );
  const seatedIdsRef = useRef<string[]>([]);
  seatedIdsRef.current = seated.map((m) => m.user_id);
  const pendingCount = game?.totals.pending_count ?? 0;
  const myQueued = queued.filter((q) => q.gameId === id);

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['game', id] });
    void queryClient.invalidateQueries({ queryKey: ['settlement', id] });
  }, [queryClient, id]);

  const logEntry = useCallback(
    async (entryType: EntryType, amountMinor: number, targetUserId: string | null = null) => {
      sheetRef.current?.close();
      setLastAmount(amountMinor);
      const clientKey = newClientKey();
      confirmHaptic();
      // an entry logged for someone else is still append-only, so it queues
      // offline exactly like your own
      const queued = {
        clientKey,
        gameId: id!,
        entryType,
        amountMinor,
        ...(targetUserId ? { targetUserId } : {}),
      };
      if (!online) {
        // held locally in a distinct "not sent" state and flushed on reconnect
        enqueue(queued);
        return;
      }
      try {
        await api.logEntry(id!, {
          entry_type: entryType,
          amount_minor: amountMinor,
          client_key: clientKey,
          ...(targetUserId ? { user_id: targetUserId } : {}),
        });
        invalidate();
      } catch (e: unknown) {
        const status_ = (e as { status?: number }).status;
        if (status_ && status_ >= 400 && status_ < 500) {
          invalidate(); // a domain refusal: show current truth
        } else {
          // network blinked mid-request: queue it; the client key makes the
          // replay safe even if the first attempt actually landed
          enqueue(queued);
          void flush(sendQueuedEntry);
        }
      }
    },
    [online, id, enqueue, flush, invalidate],
  );

  const seatPlayer = useCallback(async () => {
    const name = addName.trim();
    if (!name || adding) return;
    setAdding(true);
    setAddError(null);
    try {
      const next = await api.addPlayer(id!, name);
      const seatedBefore = new Set(seatedIdsRef.current);
      const added = next.members.find((m) => !seatedBefore.has(m.user_id));
      setAddOpen(false);
      setAddName('');
      invalidate();
      // the host seated them in order to log for them: open the sheet with
      // the new player already chosen
      if (added) {
        setSheetTarget(added.user_id);
        sheetRef.current?.expand();
      }
    } catch (e: unknown) {
      const code = (e as { code?: string }).code;
      setAddError(
        code === 'table_full'
          ? 'That table is full — every seat is taken.'
          : code === 'game_not_joinable'
            ? "This game isn't seating players right now."
            : "Couldn't add the player — try again.",
      );
    } finally {
      setAdding(false);
    }
  }, [addName, adding, id, invalidate]);

  const handOverHost = useCallback(
    async (userId: string) => {
      if (handingOver) return;
      setHandingOver(true);
      setHandOverError(null);
      try {
        await api.transferHost(id!, userId, game?.version);
        setHandOverOpen(false);
        invalidate();
      } catch (e: unknown) {
        const code = (e as { code?: string }).code;
        setHandOverError(
          code === 'guest_not_permitted'
            ? 'You added that player yourself — they have no way to sign in and hold the game.'
            : code === 'user_not_found'
              ? 'That player is no longer at the table.'
              : code === 'version_conflict'
                ? 'The game changed while this was open — check it and try again.'
                : "Couldn't hand over the game — try again.",
        );
      } finally {
        setHandingOver(false);
      }
    },
    [handingOver, id, game?.version, invalidate],
  );

  const removeMember = useCallback(
    async (userId: string) => {
      if (removing) return;
      setRemoving(true);
      setRemoveError(null);
      try {
        await api.removeMember(id!, userId, game?.version);
        setRemoveOpen(false);
        invalidate();
      } catch (e: unknown) {
        const code = (e as { code?: string }).code;
        setRemoveError(
          code === 'host_must_transfer_first'
            ? 'You can’t remove yourself while you hold the game — hand it over first.'
            : code === 'user_not_found'
              ? 'They’re not at this table.'
              : code === 'game_closed'
                ? 'This game is finished — its roster doesn’t change any more.'
                : code === 'version_conflict'
                  ? 'The table changed while this was open — check it and try again.'
                  : "Couldn't remove them — try again.",
        );
      } finally {
        setRemoving(false);
      }
    },
    [removing, id, game?.version, invalidate],
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
  // labels the primary action for what this player is actually about to do
  const boughtIn = hasBoughtIn(game.entries, meId);

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

        <BlindsRow
          smallMinor={game.small_blind_minor}
          bigMinor={game.big_blind_minor}
          currency={currency}
          exponent={exponent}
          canEdit={isHost && online && game.state !== 'closed' && game.state !== 'abandoned'}
          onChange={(small, big) => {
            void api
              .setBlinds(id!, small, big, game.version)
              .then(invalidate)
              .catch(() => invalidate());
          }}
        />

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
          {isHost && (game.state === 'open' || game.state === 'running') && (
            <Pressable
              testID="add-player"
              onPress={() => {
                setAddError(null);
                setAddOpen(true);
              }}
              disabled={!online}
              style={{ minHeight: 44, justifyContent: 'center' }}
            >
              <Text style={{ color: online ? '#34d399' : '#5d6f66' }}>
                + Add player{online ? '' : ' (offline)'}
              </Text>
            </Pressable>
          )}
          {isHost && game.state !== 'closed' && game.state !== 'abandoned' && (
            <Pressable
              testID="hand-over-host"
              onPress={() => {
                setHandOverError(null);
                setHandOverOpen(true);
              }}
              disabled={!online}
              style={{ minHeight: 44, justifyContent: 'center' }}
            >
              <Text style={{ color: online ? '#9fb0a8' : '#5d6f66' }}>
                Hand over host{online ? '' : ' (offline)'}
              </Text>
            </Pressable>
          )}
          {isHost && game.state !== 'closed' && game.state !== 'abandoned' && (
            <Pressable
              testID="remove-player"
              onPress={() => {
                setRemoveError(null);
                setRemoveOpen(true);
              }}
              disabled={!online}
              style={{ minHeight: 44, justifyContent: 'center' }}
            >
              <Text style={{ color: online ? '#9fb0a8' : '#5d6f66' }}>
                Remove player{online ? '' : ' (offline)'}
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
            No entries yet — tap Buy in below to log the first one.
          </Text>
        )}
      </ScrollView>

      {/* The persistent primary actions: bottom, thumb-reachable, any phone.
          Two buttons rather than one "Log entry", because at the table the
          question is never "log something" — it is chips on or chips off, and
          a single generic button made the person choose twice. They are told
          apart by size, colour and word, never by colour alone: money going
          on is the wide mint one, money coming off is the amber one. Amber
          reads as "this is the number that decides what you get paid", which
          is exactly the care a cash-out deserves.

          In `settling` there are no new buy-ins (app-logic), so cash-out
          takes the whole bar and the choice disappears with the option. */}
      {canLog && (
        <View
          style={{
            position: 'absolute',
            bottom: 24,
            left: 16,
            right: 16,
            flexDirection: 'row',
            gap: 12,
          }}
        >
          {game.state === 'running' && (
            <Pressable
              testID="open-entry-sheet"
              accessibilityRole="button"
              accessibilityLabel={boughtIn ? 'Log a rebuy' : 'Log a buy-in'}
              onPress={() => {
                setSheetType(boughtIn ? 'rebuy' : 'buy_in');
                sheetRef.current?.expand();
              }}
              style={{
                flex: 3,
                height: 68,
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
              <Text style={{ color: '#fff', fontSize: 20, fontWeight: '800' }}>
                {boughtIn ? '+ Rebuy' : '+ Buy in'}
              </Text>
              <Text style={{ color: '#bbf7d0', fontSize: 12 }}>chips on</Text>
            </Pressable>
          )}
          <Pressable
            testID="open-cash-out-sheet"
            accessibilityRole="button"
            accessibilityLabel="Log a cash-out"
            onPress={() => {
              setSheetType('cash_out');
              sheetRef.current?.expand();
            }}
            style={{
              flex: 2,
              height: 68,
              borderRadius: 16,
              backgroundColor: '#b45309',
              alignItems: 'center',
              justifyContent: 'center',
              shadowColor: '#000',
              shadowOpacity: 0.4,
              shadowRadius: 8,
              elevation: 6,
            }}
          >
            <Text style={{ color: '#fff', fontSize: 20, fontWeight: '800' }}>Cash out</Text>
            <Text style={{ color: '#fde68a', fontSize: 12 }}>chips off</Text>
          </Pressable>
        </View>
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
            // remounted when the target changes, so the sheet opens on the
            // player the host just seated rather than on whoever was last
            key={`${sheetTarget ?? 'me'}:${sheetType}`}
            currency={currency}
            exponent={exponent}
            stakeMinor={game.stake_minor}
            lastAmountMinor={lastAmount}
            defaultType={game.state === 'settling' ? 'cash_out' : sheetType}
            allowedTypes={game.state === 'settling' ? ['cash_out'] : ['buy_in', 'rebuy', 'cash_out']}
            seatFor={
              isHost
                ? seated
                    .filter((m) => m.user_id !== meId)
                    .map((m) => ({ userId: m.user_id, name: m.display_name }))
                : []
            }
            defaultTargetUserId={sheetTarget}
            onSubmit={logEntry}
          />
        </BottomSheetView>
      </BottomSheet>

      <RemovePlayer
        visible={removeOpen}
        members={game.members}
        hostId={game.host_id}
        entries={game.entries}
        pending={removing}
        error={removeError}
        onCancel={() => setRemoveOpen(false)}
        onRemove={removeMember}
      />

      <HandOverHost
        visible={handOverOpen}
        members={game.members}
        hostId={game.host_id}
        pending={handingOver}
        error={handOverError}
        onCancel={() => setHandOverOpen(false)}
        onTransfer={handOverHost}
      />

      {/* Seating a player is a host action, so it lives behind a deliberate
          tap and never near the entry button. */}
      <Modal visible={addOpen} transparent animationType="fade" onRequestClose={() => setAddOpen(false)}>
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.6)',
            justifyContent: 'center',
            padding: 24,
          }}
        >
          <View style={{ backgroundColor: '#111a16', borderRadius: 16, padding: 20, gap: 12 }}>
            <Text style={{ color: '#e7ece9', fontSize: 18, fontWeight: '800' }}>Add a player</Text>
            <Text style={{ color: '#9fb0a8', fontSize: 13 }}>
              For someone at the table who isn't using the app. You log their buy-ins and
              cash-outs; they can't log their own.
            </Text>
            <TextInput
              testID="add-player-name"
              value={addName}
              onChangeText={setAddName}
              placeholder="Name at the table"
              placeholderTextColor="#5d6f66"
              maxLength={60}
              autoFocus
              style={{
                minHeight: 48,
                borderRadius: 12,
                backgroundColor: '#1a2620',
                paddingHorizontal: 14,
                color: '#e7ece9',
                fontSize: 16,
              }}
            />
            {addError && (
              <Text testID="add-player-error" style={{ color: '#fb7185' }}>
                {addError}
              </Text>
            )}
            <Pressable
              testID="add-player-confirm"
              onPress={seatPlayer}
              disabled={adding}
              style={{
                height: 56,
                borderRadius: 14,
                backgroundColor: '#059669',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: adding ? 0.6 : 1,
              }}
            >
              <Text style={{ color: '#fff', fontSize: 17, fontWeight: '800' }}>
                {adding ? 'Seating…' : 'Seat them'}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setAddOpen(false)}
              style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
            >
              <Text style={{ color: '#9fb0a8' }}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}
