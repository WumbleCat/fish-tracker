import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

// Tokens are credentials: on device they live in the platform keystore via
// expo-secure-store, never AsyncStorage. (The undefined fallback exists only
// so the module can load where SecureStore doesn't — supabase-js then uses
// its own default; phones always take the SecureStore path.)
const secureStorage =
  Platform.OS === 'ios' || Platform.OS === 'android'
    ? {
        getItem: (key: string) => SecureStore.getItemAsync(key),
        setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
        removeItem: (key: string) => SecureStore.deleteItemAsync(key),
      }
    : undefined;

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const anonKey =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'public-anon-key-not-configured';

export const supabase = createClient(url, anonKey, {
  auth: {
    storage: secureStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
