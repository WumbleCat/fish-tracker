/** The front door, dealt on the felt: six chip tiles for the code, a name,
 * "Deal me in" — big enough to use while someone reads six characters
 * aloud across a room. Sign-in is the small line underneath. A join link
 * arrives here with the code already in the tiles. */

import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, TextInput, View } from 'react-native';
import { Text } from '../components/Text';

import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';

const CODE_LENGTH = 6;
const normalize = (raw: string) =>
  raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, CODE_LENGTH);

export function joinErrorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    switch (e.code) {
      case 'game_not_found':
        return 'No game with that code — check it with your host.';
      case 'game_not_joinable':
        return "That game isn't taking players right now.";
      case 'table_full':
        return 'That table is full — nine seats, all taken.';
    }
  }
  return "Couldn't join — check your connection and try again.";
}

export default function Landing() {
  const { status, guest, startGuest } = useAuth();
  const params = useLocalSearchParams<{ code?: string }>();
  const [code, setCode] = useState(() => normalize(params.code ?? ''));
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const codeInput = useRef<TextInput>(null);

  useEffect(() => {
    if (status === 'registered') {
      // a signed-in player opening a join link is seated straight away
      if (code.length === CODE_LENGTH) {
        api
          .joinGame(code)
          .then((game) => router.replace(`/game/${game.id}`))
          .catch((e) => setError(joinErrorMessage(e)));
      } else {
        router.replace('/sessions');
      }
    } else if (status === 'guest' && guest) {
      router.replace(`/game/${guest.gameId}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, guest]);

  const ready = code.length === CODE_LENGTH && name.trim().length > 0;

  const join = async () => {
    if (!ready || busy) return;
    setError(null);
    setBusy(true);
    try {
      const result = await api.guestJoin(code, name.trim());
      await startGuest({
        token: result.token,
        gameId: result.game_id,
        userId: result.user_id,
        displayName: name.trim(),
        expiresAt: result.expires_at,
      });
      router.replace(`/game/${result.game_id}`);
    } catch (e) {
      setError(joinErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const cells = Array.from({ length: CODE_LENGTH }, (_, i) => code[i] ?? '');
  const activeIndex = Math.min(code.length, CODE_LENGTH - 1);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, justifyContent: 'center', padding: 26, gap: 20 }}
    >
      <Text style={{ color: '#e7ece9', fontSize: 26, fontWeight: '700' }}>Sit down</Text>

      <Pressable
        onPress={() => codeInput.current?.focus()}
        accessibilityLabel="join code"
        style={{ flexDirection: 'row', gap: 7 }}
      >
        {cells.map((char, i) => {
          const filled = char !== '';
          const active = !filled && i === activeIndex;
          return (
            <View
              key={i}
              style={{
                flex: 1,
                aspectRatio: 1,
                borderRadius: 99,
                backgroundColor: filled ? '#0f2a1f' : 'rgba(255,255,255,.04)',
                borderWidth: 2,
                borderColor: filled || active ? '#34d399' : '#24332c',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ color: '#e7ece9', fontSize: 19, fontVariant: ['tabular-nums'] }}>
                {char}
              </Text>
            </View>
          );
        })}
      </Pressable>
      <TextInput
        ref={codeInput}
        value={code}
        onChangeText={(t) => setCode(normalize(t))}
        autoFocus={!params.code}
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={CODE_LENGTH}
        accessibilityLabel="join code input"
        style={{ position: 'absolute', opacity: 0, width: 1, height: 1 }}
      />

      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="Name at the table"
        placeholderTextColor="#5d6f66"
        maxLength={60}
        autoFocus={!!params.code}
        style={{
          backgroundColor: 'rgba(255,255,255,.05)',
          borderWidth: 1,
          borderColor: '#24332c',
          color: '#e7ece9',
          fontSize: 16,
          borderRadius: 99,
          paddingVertical: 15,
          paddingHorizontal: 20,
        }}
      />
      {error && <Text style={{ color: '#fb7185' }}>{error}</Text>}
      <Pressable
        disabled={!ready || busy}
        onPress={join}
        accessibilityRole="button"
        style={{
          height: 62,
          borderRadius: 99,
          backgroundColor: ready && !busy ? '#34d399' : '#24332c',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ color: ready ? '#06231a' : '#9fb0a8', fontSize: 17, fontWeight: '800' }}>
          Deal me in
        </Text>
      </Pressable>
      <Pressable
        onPress={() => router.push('/signin')}
        style={{ minHeight: 44, justifyContent: 'center' }}
      >
        <Text style={{ color: '#5d6f66', textAlign: 'center', fontSize: 13.5 }}>
          Host?{' '}
          <Text style={{ color: '#34d399', textDecorationLine: 'underline' }}>Sign in</Text>
        </Text>
      </Pressable>
    </KeyboardAvoidingView>
  );
}
