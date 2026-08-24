/** The front door: join by code, big enough to use while someone reads six
 * characters aloud across a room. Sign-in is secondary. */

import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, TextInput, View } from 'react-native';
import { Text } from '../components/Text';

import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';

export default function Landing() {
  const { status, guest, startGuest } = useAuth();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (status === 'registered') router.replace('/sessions');
    else if (status === 'guest' && guest) router.replace(`/game/${guest.gameId}`);
  }, [status, guest]);

  const join = async () => {
    setError(null);
    setBusy(true);
    try {
      const result = await api.guestJoin(code.toUpperCase(), name.trim());
      await startGuest({
        token: result.token,
        gameId: result.game_id,
        userId: result.user_id,
        displayName: name.trim(),
        expiresAt: result.expires_at,
      });
      router.replace(`/game/${result.game_id}`);
    } catch (e) {
      setError(
        e instanceof ApiError && e.code === 'game_not_found'
          ? 'No game with that code — check it with your host.'
          : e instanceof ApiError && e.code === 'game_not_joinable'
            ? "That game isn't taking players right now."
            : "Couldn't join — check your connection and try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, justifyContent: 'center', padding: 24, gap: 16 }}
    >
      <Text style={{ color: '#e7ece9', fontSize: 32, fontWeight: '800' }}>🐟 fish-tracker</Text>
      <Text style={{ color: '#9fb0a8', fontSize: 16 }}>
        Joining a game? Type the code your host reads out.
      </Text>
      <TextInput
        value={code}
        onChangeText={(t) => setCode(t.toUpperCase())}
        placeholder="GAME CODE"
        placeholderTextColor="#5d6f66"
        autoCapitalize="characters"
        maxLength={6}
        style={{
          backgroundColor: '#1a2620',
          color: '#e7ece9',
          fontSize: 28,
          letterSpacing: 8,
          textAlign: 'center',
          borderRadius: 14,
          padding: 16,
          fontVariant: ['tabular-nums'],
        }}
      />
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="Your name at the table"
        placeholderTextColor="#5d6f66"
        maxLength={60}
        style={{
          backgroundColor: '#1a2620',
          color: '#e7ece9',
          fontSize: 18,
          borderRadius: 14,
          padding: 16,
        }}
      />
      {error && <Text style={{ color: '#fb7185' }}>{error}</Text>}
      <Pressable
        disabled={busy || code.length < 6 || !name.trim()}
        onPress={join}
        style={{
          height: 64,
          borderRadius: 14,
          backgroundColor: busy || code.length < 6 || !name.trim() ? '#24332c' : '#059669',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ color: '#fff', fontSize: 18, fontWeight: '800' }}>Join the game</Text>
      </Pressable>
      <Pressable onPress={() => router.push('/signin')} style={{ minHeight: 44, justifyContent: 'center' }}>
        <Text style={{ color: '#9fb0a8', textAlign: 'center', textDecorationLine: 'underline' }}>
          Have an account? Sign in
        </Text>
      </Pressable>
    </KeyboardAvoidingView>
  );
}
