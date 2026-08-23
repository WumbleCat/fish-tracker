/** One auth surface over two token kinds: a Supabase session (kept by
 * supabase-js in secure storage) or an API-minted guest token, also in
 * secure storage — a guest token is scoped to one game but is still a
 * credential. */

import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';

import { api, setTokenProvider } from './api';
import { supabase } from './supabase';

const GUEST_KEY = 'fish_guest_session';

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
    const raw = await SecureStore.getItemAsync(GUEST_KEY);
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
        await SecureStore.setItemAsync(GUEST_KEY, JSON.stringify(updated));
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
        void SecureStore.deleteItemAsync(GUEST_KEY);
      } else if (get().guest == null) {
        set({ status: 'signedOut' });
      }
    });
  },

  startGuest: async (guest) => {
    await SecureStore.setItemAsync(GUEST_KEY, JSON.stringify(guest));
    supabase.realtime.setAuth(guest.token);
    set({ status: 'guest', guest });
  },

  signOut: async () => {
    await SecureStore.deleteItemAsync(GUEST_KEY);
    await supabase.auth.signOut();
    set({ status: 'signedOut', guest: null });
  },
}));
