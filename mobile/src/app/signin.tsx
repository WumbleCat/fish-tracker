import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, Text, TextInput } from 'react-native';

import { supabase } from '../lib/supabase';

export default function SignIn() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Confirmation links open in a mail app, so they land on the web app —
  // sign in here afterwards.
  const WEB_URL = 'https://fish-tracker-app.vercel.app';

  const submit = async () => {
    setError(null);
    setMessage(null);
    const result =
      mode === 'signup'
        ? await supabase.auth.signUp({
            email,
            password,
            options: {
              data: { display_name: displayName || email.split('@')[0] },
              emailRedirectTo: WEB_URL,
            },
          })
        : await supabase.auth.signInWithPassword({ email, password });
    if (result.error) setError(result.error.message);
    else if (mode === 'signup' && !result.data.session)
      setMessage(`Confirmation email sent to ${email} — open it, then sign in here.`);
    else router.replace('/sessions');
  };

  const magicLink = async () => {
    setError(null);
    const { error: e } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: WEB_URL },
    });
    if (e) setError(e.message);
    else setMessage(`Magic link sent to ${email} — open it on this phone.`);
  };

  const field = {
    backgroundColor: '#1a2620',
    color: '#e7ece9',
    fontSize: 16,
    borderRadius: 12,
    padding: 14,
  } as const;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, justifyContent: 'center', padding: 24, gap: 12 }}
    >
      <Text style={{ color: '#e7ece9', fontSize: 24, fontWeight: '800' }}>
        {mode === 'signin' ? 'Sign in' : 'Create an account'}
      </Text>
      {mode === 'signup' && (
        <TextInput
          value={displayName}
          onChangeText={setDisplayName}
          placeholder="Display name"
          placeholderTextColor="#5d6f66"
          style={field}
        />
      )}
      <TextInput
        value={email}
        onChangeText={setEmail}
        placeholder="Email"
        placeholderTextColor="#5d6f66"
        autoCapitalize="none"
        keyboardType="email-address"
        style={field}
      />
      <TextInput
        value={password}
        onChangeText={setPassword}
        placeholder="Password"
        placeholderTextColor="#5d6f66"
        secureTextEntry
        style={field}
      />
      {error && <Text style={{ color: '#fb7185' }}>{error}</Text>}
      {message && <Text style={{ color: '#34d399' }}>{message}</Text>}
      <Pressable
        onPress={submit}
        style={{
          height: 56,
          borderRadius: 12,
          backgroundColor: '#059669',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>
          {mode === 'signin' ? 'Sign in' : 'Sign up'}
        </Text>
      </Pressable>
      <Pressable onPress={magicLink} disabled={!email} style={{ minHeight: 44, justifyContent: 'center' }}>
        <Text style={{ color: '#34d399', textAlign: 'center' }}>Email me a magic link instead</Text>
      </Pressable>
      <Pressable
        onPress={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
        style={{ minHeight: 44, justifyContent: 'center' }}
      >
        <Text style={{ color: '#9fb0a8', textAlign: 'center' }}>
          {mode === 'signin' ? 'Need an account? Sign up' : 'Have an account? Sign in'}
        </Text>
      </Pressable>
    </KeyboardAvoidingView>
  );
}
