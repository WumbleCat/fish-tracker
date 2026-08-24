/** Past games plus per-currency lifetime net — never summed across
 * currencies; there is no FX in this product. */

import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, TextInput, View } from 'react-native';
import { Text } from '../components/Text';

import { AmountText } from '../components/AmountText';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useGames, useHistory } from '../lib/queries';

export default function Sessions() {
  const { status } = useAuth();
  const { data: games, refetch } = useGames(status === 'registered');
  const { data: history } = useHistory(status === 'registered');
  const [joinCode, setJoinCode] = useState('');
  const [joinError, setJoinError] = useState<string | null>(null);

  const join = async () => {
    setJoinError(null);
    try {
      const game = await api.joinGame(joinCode.toUpperCase());
      setJoinCode('');
      void refetch();
      router.push(`/game/${game.id}`);
    } catch {
      setJoinError("Couldn't join with that code — check it with your host.");
    }
  };

  return (
    <View style={{ flex: 1, padding: 16, gap: 12 }}>
      <Stack.Screen
        options={{
          title: 'Sessions',
          headerRight: () => (
            <Pressable onPress={() => router.push('/settings')} style={{ minHeight: 44, justifyContent: 'center' }}>
              <Text style={{ color: '#9fb0a8' }}>Settings</Text>
            </Pressable>
          ),
        }}
      />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <TextInput
          testID="join-code-input"
          value={joinCode}
          onChangeText={(t) => setJoinCode(t.toUpperCase())}
          placeholder="Join a game by code"
          placeholderTextColor="#5d6f66"
          autoCapitalize="characters"
          maxLength={6}
          style={{
            flex: 1,
            backgroundColor: '#1a2620',
            color: '#e7ece9',
            borderRadius: 12,
            padding: 12,
            letterSpacing: 3,
          }}
        />
        <Pressable
          testID="join-code-button"
          disabled={joinCode.length < 6}
          onPress={join}
          style={{
            minHeight: 44,
            paddingHorizontal: 18,
            borderRadius: 12,
            backgroundColor: joinCode.length < 6 ? '#24332c' : '#059669',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ color: '#fff', fontWeight: '700' }}>Join</Text>
        </Pressable>
      </View>
      {joinError && <Text style={{ color: '#fb7185' }}>{joinError}</Text>}
      {history?.currencies.map((c) => (
        <View
          key={c.currency}
          style={{ backgroundColor: '#111a16', borderRadius: 12, padding: 12, flexDirection: 'row', alignItems: 'center' }}
        >
          <Text style={{ color: '#9fb0a8' }}>
            {c.currency} lifetime · {c.games_played} game{c.games_played === 1 ? '' : 's'}
          </Text>
          <View style={{ flex: 1 }} />
          <AmountText
            minor={c.net_minor + c.adjustments_minor}
            currency={c.currency}
            exponent={c.currency_exponent}
            signed
            bold
          />
        </View>
      ))}
      <FlatList
        data={games ?? []}
        keyExtractor={(g) => g.id}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push(`/game/${item.id}`)}
            style={{ backgroundColor: '#111a16', borderRadius: 12, padding: 14, minHeight: 44 }}
          >
            <Text style={{ color: '#e7ece9', fontWeight: '600' }}>{item.name}</Text>
            <Text style={{ color: '#9fb0a8', fontSize: 12 }}>
              {item.state} · {item.currency} · {new Date(item.created_at).toLocaleDateString()}
            </Text>
          </Pressable>
        )}
        ListEmptyComponent={
          <Text style={{ color: '#9fb0a8' }}>
            No games yet. Create one on the web app, or join with a code from your host.
          </Text>
        }
      />
    </View>
  );
}
