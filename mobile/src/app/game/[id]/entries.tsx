/** This player's own history in this game, with amend on rejected entries.
 * The amend logs a NEW pending entry; the rejected row stays visible. */

import { useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, Text, TextInput, View } from 'react-native';

import { AmountText } from '../../../components/AmountText';
import { amendEntry } from '../../../lib/actions';
import { useAuth } from '../../../lib/auth';
import { parseToMinor } from '../../../lib/money';
import { useOnline } from '../../../lib/online';
import { useGame, useGameRealtime, useMe } from '../../../lib/queries';

const STATE_COLORS: Record<string, string> = {
  pending: '#fbbf24',
  verified: '#34d399',
  rejected: '#fb7185',
  void: '#5d6f66',
};

export default function MyEntries() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();
  const { status, guest } = useAuth();
  const { data: me } = useMe(status !== 'guest');
  const meId = status === 'guest' ? (guest?.userId ?? null) : (me?.id ?? null);
  const { data: game } = useGame(id);
  useGameRealtime(id);
  const online = useOnline((s) => s.online);
  const [amending, setAmending] = useState<string | null>(null);
  const [amount, setAmount] = useState('');

  const mine = (game?.entries ?? []).filter((e) => e.user_id === meId).reverse();

  return (
    <View style={{ flex: 1, padding: 16 }}>
      <Stack.Screen options={{ title: 'My entries' }} />
      <FlatList
        data={mine}
        keyExtractor={(e) => e.id}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: '#111a16', borderRadius: 12, padding: 12, gap: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ color: '#e7ece9' }}>{item.entry_type.replace('_', '-')}</Text>
              <Text style={{ color: STATE_COLORS[item.state], fontSize: 12 }}>{item.state}</Text>
              {item.amends_entry_id && (
                <Text style={{ color: '#5d6f66', fontSize: 12 }}>amendment</Text>
              )}
              <View style={{ flex: 1 }} />
              <AmountText
                minor={item.amount_minor}
                currency={game?.currency ?? 'GBP'}
                exponent={game?.currency_exponent ?? 2}
                bold
              />
            </View>
            {item.rejection_note && (
              <Text style={{ color: '#9fb0a8', fontSize: 13 }}>Host: “{item.rejection_note}”</Text>
            )}
            {item.state === 'rejected' &&
              (amending === item.id ? (
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TextInput
                    autoFocus
                    value={amount}
                    onChangeText={setAmount}
                    keyboardType="decimal-pad"
                    placeholder="corrected amount"
                    placeholderTextColor="#5d6f66"
                    style={{
                      flex: 1,
                      backgroundColor: '#1a2620',
                      color: '#e7ece9',
                      borderRadius: 10,
                      padding: 10,
                    }}
                  />
                  <Pressable
                    onPress={async () => {
                      const minor = parseToMinor(amount, game?.currency_exponent ?? 2);
                      if (minor === null || minor <= 0) return;
                      try {
                        await amendEntry(item, minor, online);
                        setAmending(null);
                        setAmount('');
                        void queryClient.invalidateQueries({ queryKey: ['game', id] });
                      } catch {
                        // stays editable; the note above explains offline
                      }
                    }}
                    style={{
                      minHeight: 44,
                      paddingHorizontal: 16,
                      borderRadius: 10,
                      backgroundColor: '#059669',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text style={{ color: '#fff', fontWeight: '700' }}>Log fix</Text>
                  </Pressable>
                </View>
              ) : (
                <Pressable
                  disabled={!online}
                  onPress={() => setAmending(item.id)}
                  style={{ minHeight: 44, justifyContent: 'center' }}
                >
                  <Text style={{ color: online ? '#fbbf24' : '#5d6f66' }}>
                    {online ? 'Amend with the right amount →' : 'Amend needs a connection'}
                  </Text>
                </Pressable>
              ))}
          </View>
        )}
        ListEmptyComponent={
          <Text style={{ color: '#9fb0a8' }}>Nothing logged yet in this game.</Text>
        }
      />
    </View>
  );
}
