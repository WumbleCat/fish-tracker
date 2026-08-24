/** One auth surface over two token kinds: a Supabase session for registered
 * users, or an API-minted guest token scoped to a single game.
 *
 * A guest is remembered: the session lives in localStorage, and every visit
 * (and every return to the tab) refreshes the token so it never quietly
 * expires between one week's game and the next. The stored session is only
 * dropped when the server says the token is no longer valid — never on a
 * network blip. */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { api, ApiError, setTokenProvider } from './api';
import { supabase } from './supabase';

const GUEST_KEY = 'fish_guest';

interface GuestSession {
  token: string;
  gameId: string;
  userId: string;
  displayName: string;
  expiresAt?: string;
}

interface AuthState {
  status: 'loading' | 'signedOut' | 'registered' | 'guest';
  guest: GuestSession | null;
  signOut: () => Promise<void>;
  startGuestSession: (guest: GuestSession) => void;
  refresh: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function readGuest(): GuestSession | null {
  try {
    const raw = localStorage.getItem(GUEST_KEY);
    return raw ? (JSON.parse(raw) as GuestSession) : null;
  } catch {
    return null;
  }
}

function writeGuest(g: GuestSession): void {
  localStorage.setItem(GUEST_KEY, JSON.stringify(g));
  supabase.realtime.setAuth(g.token);
}

/** Extend the stored guest token. Returns the session to keep, or null when
 * the server has definitively rejected it (expired, revoked). A closed game
 * or a network failure keeps the session: the person is still who they were. */
export async function refreshGuest(current: GuestSession): Promise<GuestSession | null> {
  try {
    const r = await api.guestRefresh();
    const next = { ...current, token: r.token, expiresAt: r.expires_at };
    writeGuest(next);
    return next;
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return null;
    return current;
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
        const kept = await refreshGuest(g);
        if (cancelled) return;
        if (kept) setGuest(kept);
        else {
          localStorage.removeItem(GUEST_KEY);
          setGuest(null);
          setStatus('signedOut');
        }
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

  // coming back to the tab after a while: extend the guest token again
  useEffect(() => {
    if (status !== 'guest') return;
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      const g = readGuest();
      if (g) void refreshGuest(g).then((kept) => kept && setGuest(kept));
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [status]);

  const signOut = useCallback(async () => {
    localStorage.removeItem(GUEST_KEY);
    setGuest(null);
    await supabase.auth.signOut();
    setStatus('signedOut');
  }, []);

  const startGuestSession = useCallback((g: GuestSession) => {
    writeGuest(g);
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
