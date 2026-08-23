/** One screen, two doors: sign in / sign up (toggling in place, keeping
 * typed input) and the join-by-code guest path — obvious, because the
 * person using it is standing in a kitchen with the code read aloud. */

import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';

import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';

export function Landing() {
  const navigate = useNavigate();
  const { startGuestSession } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const [joinCode, setJoinCode] = useState('');
  const [guestName, setGuestName] = useState('');
  const [joinError, setJoinError] = useState<string | null>(null);

  const handleAuth = async (event: FormEvent) => {
    event.preventDefault();
    setAuthError(null);
    if (mode === 'signup') {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { display_name: displayName || email.split('@')[0] } },
      });
      if (error) setAuthError(error.message);
      else navigate('/sessions');
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setAuthError(error.message);
      else navigate('/sessions');
    }
  };

  const handleMagicLink = async () => {
    setAuthError(null);
    const { error } = await supabase.auth.signInWithOtp({ email });
    if (error) setAuthError(error.message);
    else setInfo(`Magic link sent to ${email}`);
  };

  const handleGuestJoin = async (event: FormEvent) => {
    event.preventDefault();
    setJoinError(null);
    try {
      const result = await api.guestJoin(joinCode.toUpperCase(), guestName);
      startGuestSession({
        token: result.token,
        gameId: result.game_id,
        userId: result.user_id,
        displayName: guestName,
      });
      navigate(`/session/${result.game_id}`);
    } catch (e) {
      setJoinError(
        e instanceof ApiError && e.code === 'game_not_found'
          ? 'No game with that code — check it and try again.'
          : e instanceof ApiError && e.code === 'game_not_joinable'
            ? "That game isn't accepting players right now."
            : 'Could not join — try again.',
      );
    }
  };

  return (
    <div className="mx-auto mt-16 grid max-w-3xl grid-cols-2 gap-8">
      <section className="rounded-lg border border-neutral-200 bg-white p-6">
        <h2 className="text-lg font-semibold">
          {mode === 'signin' ? 'Sign in' : 'Create an account'}
        </h2>
        <form onSubmit={handleAuth} className="mt-4 space-y-3">
          {mode === 'signup' && (
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Display name"
              className="w-full rounded border border-neutral-300 px-3 py-2 text-sm"
            />
          )}
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            className="w-full rounded border border-neutral-300 px-3 py-2 text-sm"
          />
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="w-full rounded border border-neutral-300 px-3 py-2 text-sm"
          />
          {authError && (
            <p role="alert" className="text-sm text-rose-700">
              {authError}
            </p>
          )}
          {info && <p className="text-sm text-emerald-700">{info}</p>}
          <button
            type="submit"
            className="w-full rounded bg-neutral-900 px-3 py-2 text-sm font-medium text-white"
          >
            {mode === 'signin' ? 'Sign in' : 'Sign up'}
          </button>
        </form>
        <div className="mt-3 flex justify-between text-xs text-neutral-500">
          <button onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')} className="underline">
            {mode === 'signin' ? 'Need an account? Sign up' : 'Have an account? Sign in'}
          </button>
          <button onClick={handleMagicLink} className="underline" disabled={!email}>
            Email me a magic link
          </button>
        </div>
      </section>

      <section className="rounded-lg border-2 border-emerald-600 bg-white p-6">
        <h2 className="text-lg font-semibold">Joining a game?</h2>
        <p className="mt-1 text-sm text-neutral-500">
          Enter the code your host reads out. No account needed.
        </p>
        <form onSubmit={handleGuestJoin} className="mt-4 space-y-3">
          <input
            required
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            placeholder="Game code, e.g. XYZW34"
            maxLength={6}
            className="num w-full rounded border border-neutral-300 px-3 py-2 text-center text-lg tracking-[0.3em] uppercase"
            aria-label="join code"
          />
          <input
            required
            value={guestName}
            onChange={(e) => setGuestName(e.target.value)}
            placeholder="Your name at the table"
            maxLength={60}
            className="w-full rounded border border-neutral-300 px-3 py-2 text-sm"
            aria-label="display name"
          />
          {joinError && (
            <p role="alert" className="text-sm text-rose-700">
              {joinError}
            </p>
          )}
          <button
            type="submit"
            className="w-full rounded bg-emerald-700 px-3 py-2 text-sm font-medium text-white"
          >
            Join as guest
          </button>
        </form>
      </section>
    </div>
  );
}
