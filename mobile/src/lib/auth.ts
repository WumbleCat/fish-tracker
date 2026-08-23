/** One auth surface over two token kinds: a Supabase session (kept by
 * supabase-js in secure storage) or an API-minted guest token, also in
 * secure storage — a guest token is scoped to one game but is still a
 * credential. */

import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { create } from 'zustand';

import { api, setTokenProvider } from './api';
import { supabase } from './supabase';

const GUEST_KEY = 'fish_guest_session';

// On device, credentials live in the platform keystore. The web target
// (dev/testing only — the product ships as a phone app) falls back to
// localStorage, where SecureStore does not exist.
const onDevice = Platform.OS === 'ios' || Platform.OS === 'android';
const credStore = {
  get: (k: string) =>
    onDevice ? SecureStore.getItemAsync(k) : Promise.resolve(globalThis.localStorage?.getItem(k) ?? null),
  set: (k: string, v: string) =>
    onDevice ? SecureStore.setItemAsync(k, v) : Promise.resolve(globalThis.localStorage?.setItem(k, v)),
  delete: (k: string) =>
    onDevice ? SecureStore.deleteItemAsync(k) : Promise.resolve(globalThis.localStorage?.removeItem(k)),
};

export interface GuestSession {
  token: string;
  gameId: string;
  userId: string;
  displayName: string;
  expiresAt: string;
}

interface AuthState {
  status: 'loading' | 'signedOut' | 'registered' | 'guest';
  guest: GuestSession | null;
  bootstrap: () => Promise<void>;
  startGuest: (guest: GuestSession) => Promise<void>;
  signOut: () => Promise<void>;
}

async function readGuest(): Promise<GuestSession | null> {
  try {
    const raw = await credStore.get(GUEST_KEY);
    return raw ? (JSON.parse(raw) as GuestSession) : null;
  } catch {
    return null;
  }
}

export const useAuth = create<AuthState>((set, get) => ({
  status: 'loading',
  guest: null,

  bootstrap: async () => {
    setTokenProvider(async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) return data.session.access_token;
      return (await readGuest())?.token ?? null;
    });

    const { data } = await supabase.auth.getSession();
    if (data.session) {
      set({ status: 'registered', guest: null });
      return;
    }
    const guest = await readGuest();
    if (guest) {
      supabase.realtime.setAuth(guest.token);
      set({ status: 'guest', guest });
      // Refresh in the background so a token never expires mid-game; if the
      // game has closed the old token stays and reads still work until exp.
      try {
        const fresh = await api.guestRefresh();
        const updated: GuestSession = {
          ...guest,
          token: fresh.token,
          expiresAt: fresh.expires_at,
        };
        await credStore.set(GUEST_KEY, JSON.stringify(updated));
        supabase.realtime.setAuth(updated.token);
        set({ guest: updated });
      } catch {
        // restored silently from secure storage; never bounce to login
      }
    } else {
      set({ status: 'signedOut' });
    }

    supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        set({ status: 'registered', guest: null });
        void credStore.delete(GUEST_KEY);
      } else if (get().guest == null) {
        set({ status: 'signedOut' });
      }
    });
  },

  startGuest: async (guest) => {
    await credStore.set(GUEST_KEY, JSON.stringify(guest));
    supabase.realtime.setAuth(guest.token);
    set({ status: 'guest', guest });
  },

  signOut: async () => {
    await credStore.delete(GUEST_KEY);
    await supabase.auth.signOut();
    set({ status: 'signedOut', guest: null });
  },
}));
