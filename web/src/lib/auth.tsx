/** One auth surface over two token kinds: a Supabase session for registered
 * users, or an API-minted guest token scoped to a single game. */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { setTokenProvider } from './api';
import { supabase } from './supabase';

const GUEST_KEY = 'fish_guest';

interface GuestSession {
  token: string;
  gameId: string;
  userId: string;
  displayName: string;
}

interface AuthState {
  status: 'loading' | 'signedOut' | 'registered' | 'guest';
  guest: GuestSession | null;
  signOut: () => Promise<void>;
  startGuestSession: (guest: GuestSession) => void;
  refresh: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

function readGuest(): GuestSession | null {
  try {
    const raw = localStorage.getItem(GUEST_KEY);
    return raw ? (JSON.parse(raw) as GuestSession) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthState['status']>('loading');
  const [guest, setGuest] = useState<GuestSession | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setTokenProvider(async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) return data.session.access_token;
      return readGuest()?.token ?? null;
    });

    (async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (data.session) {
        setStatus('registered');
        return;
      }
      const g = readGuest();
      if (g) {
        // Realtime checks RLS with this token; without it the subscription
        // silently receives nothing.
        supabase.realtime.setAuth(g.token);
        setGuest(g);
        setStatus('guest');
      } else {
        setStatus('signedOut');
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        localStorage.removeItem(GUEST_KEY);
        setGuest(null);
        setStatus('registered');
      } else if (readGuest()) {
        setGuest(readGuest());
        setStatus('guest');
      } else {
        setStatus('signedOut');
      }
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [tick]);

  const signOut = useCallback(async () => {
    localStorage.removeItem(GUEST_KEY);
    setGuest(null);
    await supabase.auth.signOut();
    setStatus('signedOut');
  }, []);

  const startGuestSession = useCallback((g: GuestSession) => {
    localStorage.setItem(GUEST_KEY, JSON.stringify(g));
    supabase.realtime.setAuth(g.token);
    setGuest(g);
    setStatus('guest');
  }, []);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  const value = useMemo(
    () => ({ status, guest, signOut, startGuestSession, refresh }),
    [status, guest, signOut, startGuestSession, refresh],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}
