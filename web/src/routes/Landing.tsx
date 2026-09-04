/** The front door, dealt on the felt: six chip tiles for the code, a name,
 * and "Deal me in" — the guest path is the whole left side because the
 * person using it is standing in a kitchen with the code read aloud.
 * Hosts and regulars sign in from the card on the right. Always dark, in
 * either theme: this screen is the identity, not a surface. */

import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { CODE_LENGTH, CodeTiles } from '../components/CodeTiles';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useGames, useMe } from '../lib/queries';
import { supabase } from '../lib/supabase';

export function joinErrorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    switch (e.code) {
      case 'game_not_found':
        return 'No game with that code — check it and try again.';
      case 'game_not_joinable':
        return "That game isn't accepting players right now.";
      case 'table_full':
        return 'That table is full — eleven seats, all taken.';
      case 'guest_unavailable':
        return 'Guest joining is unavailable right now — sign in instead.';
    }
  }
  return 'Could not join — try again.';
}

const field =
  'w-full rounded-full border border-felt-700 bg-white/5 px-6 py-4 text-[17px] text-felt-100 placeholder:text-felt-600 focus:border-emerald-400 focus:outline-none';
// text-base below sm: is not a style choice — iOS Safari zooms the page in
// on any focused input under 16px, and the zoom does not undo on blur.
const cardField =
  'w-full rounded-xl border border-felt-700 bg-white/5 px-4 py-3 text-base text-felt-100 placeholder:text-felt-600 focus:border-emerald-400 focus:outline-none sm:text-sm';


/** Who the code will seat — signed in, there is no name to type, so say
 * which name is going to appear at the table. */
function SeatedAs() {
  const { data: me } = useMe(true);
  return (
    <span className="text-[13px] text-felt-600">
      seating you as{' '}
      <span className="text-felt-300">{me?.display_name ?? 'your account'}</span>
    </span>
  );
}

/** The signed-in half of the front door: the way back to everything else.
 * Deliberately a short list plus a link — this screen is for joining, and
 * the full history lives at /sessions. */
function YourTables() {
  const { data: games } = useGames();
  const recent = (games ?? []).slice(0, 3);

  return (
    <div className="rounded-2xl border border-felt-700 bg-white/[0.03] p-5">
      <p className="mb-3 font-mono text-[10px] font-semibold tracking-[0.12em] text-felt-600">
        YOUR TABLES
      </p>
      {recent.length === 0 ? (
        <p className="text-[13px] text-felt-300">
          No tables yet — start one from your sessions.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {recent.map((g) => (
            <li key={g.id} className="flex items-center gap-3">
              <Link
                to={`/session/${g.id}`}
                className="min-w-0 flex-1 truncate text-[15px] text-felt-100 underline-offset-2 hover:underline"
              >
                {g.name}
              </Link>
              <span className="num shrink-0 text-[11px] text-felt-600">{g.state}</span>
            </li>
          ))}
        </ul>
      )}
      <Link
        to="/sessions"
        className="mt-4 flex h-11 items-center justify-center rounded-full bg-emerald-600 text-[15px] font-bold text-white hover:brightness-105"
      >
        All my sessions
      </Link>
    </div>
  );
}

export function Landing({ initialCode = '' }: { initialCode?: string }) {
  const navigate = useNavigate();
  const { status, startGuestSession } = useAuth();
  // Signed in, the front door is a quick-join: they already have a name and
  // an identity, so the code is the only thing left to type — and the join
  // goes through the registered path, not the guest one.
  const signedIn = status === 'registered';

  const [joinCode, setJoinCode] = useState(initialCode);
  const [guestName, setGuestName] = useState('');
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const ready =
    joinCode.length === CODE_LENGTH && (signedIn || guestName.trim().length > 0);

  const handleGuestJoin = async (event: FormEvent) => {
    event.preventDefault();
    if (!ready || joining) return;
    setJoinError(null);
    setJoining(true);
    try {
      if (signedIn) {
        // seated as themselves; no guest identity is created
        const game = await api.joinGame(joinCode);
        navigate(`/session/${game.id}`);
        return;
      }
      const result = await api.guestJoin(joinCode, guestName.trim());
      startGuestSession({
        token: result.token,
        gameId: result.game_id,
        userId: result.user_id,
        displayName: guestName.trim(),
        expiresAt: result.expires_at,
      });
      navigate(`/session/${result.game_id}`);
    } catch (e) {
      setJoinError(joinErrorMessage(e));
    } finally {
      setJoining(false);
    }
  };

  const handleAuth = async (event: FormEvent) => {
    event.preventDefault();
    setAuthError(null);
    setInfo(null);
    if (mode === 'signup') {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { display_name: displayName || email.split('@')[0] },
          // confirmation links must come back to THIS origin, not the
          // Supabase project default
          emailRedirectTo: window.location.origin,
        },
      });
      if (error) {
        setAuthError(error.message);
      } else if (!data.session) {
        // hosted Supabase requires email confirmation before a session exists
        setInfo(`Confirmation email sent to ${email} — open it, then sign in here.`);
        setMode('signin');
      } else {
        navigate('/sessions');
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setAuthError(error.message);
      else navigate('/sessions');
    }
  };

  const handleMagicLink = async () => {
    setAuthError(null);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    });
    if (error) setAuthError(error.message);
    else setInfo(`Magic link sent to ${email}`);
  };

  return (
    <div
      className="mx-auto mt-4 max-w-6xl rounded-2xl bg-felt-950 px-5 py-10 text-felt-100 sm:rounded-3xl sm:px-10 sm:py-14 lg:px-16 lg:py-[72px]"
      style={{
        background: 'radial-gradient(80% 120% at 15% 0%, #183025 0%, #0d1512 55%, #0b1210 100%)',
      }}
    >
      {/* Two columns side by side is a desktop shape: below lg the sign-in
          card sits under the join form rather than being squeezed. */}
      <div className="flex flex-col gap-10 lg:flex-row lg:items-center lg:gap-14">
        <form
          onSubmit={handleGuestJoin}
          className="flex min-w-0 flex-1 flex-col gap-6"
          aria-label="join a game"
        >
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1 className="text-[28px] font-bold tracking-tight sm:text-[34px]">Sit down</h1>
            <span className="num text-[13px] tracking-[0.1em] text-emerald-400">
              {CODE_LENGTH} CHARACTERS
            </span>
          </div>
          <CodeTiles value={joinCode} onChange={setJoinCode} autoFocus={!initialCode} />
          {!signedIn && (
            <input
              required
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              placeholder="Name at the table"
              maxLength={60}
              autoFocus={!!initialCode}
              className={`${field} max-w-[400px]`}
              aria-label="display name"
            />
          )}
          {joinError && (
            <p role="alert" className="text-sm text-rose-400">
              {joinError}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
            <button
              type="submit"
              className={`rounded-full px-10 py-4 text-[17px] font-extrabold transition ${
                ready ? 'bg-emerald-400 text-emerald-950 hover:brightness-105' : 'bg-felt-700 text-felt-300'
              }`}
            >
              Deal me in
            </button>
            {signedIn ? (
              <SeatedAs />
            ) : (
              <span className="text-[13px] text-felt-600">
                or{' '}
                <button
                  type="button"
                  onClick={() => document.getElementById('signin-email')?.focus()}
                  className="text-emerald-400 underline underline-offset-2"
                >
                  sign in
                </button>{' '}
                to host
              </span>
            )}
          </div>
        </form>

        <div className="flex w-full flex-col gap-3.5 lg:w-[300px] lg:shrink-0">
          {signedIn ? (
            <YourTables />
          ) : (
          <form
            onSubmit={handleAuth}
            className="rounded-2xl border border-felt-700 bg-white/[0.03] p-5"
            aria-label={mode === 'signin' ? 'sign in' : 'create an account'}
          >
            <p className="mb-3 font-mono text-[10px] font-semibold tracking-[0.12em] text-felt-600">
              {mode === 'signin' ? 'HOST OR REGULAR' : 'NEW ACCOUNT'}
            </p>
            <div className="flex flex-col gap-2.5">
              {mode === 'signup' && (
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Display name"
                  className={cardField}
                />
              )}
              <input
                id="signin-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                className={cardField}
              />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                className={cardField}
              />
              {authError && (
                <p role="alert" className="text-xs text-rose-400">
                  {authError}
                </p>
              )}
              {info && <p className="text-xs text-emerald-400">{info}</p>}
              <button
                type="submit"
                className="mt-1 h-12 rounded-full bg-emerald-600 text-[15px] font-bold text-white hover:brightness-105"
              >
                {mode === 'signin' ? 'Sign in' : 'Sign up'}
              </button>
            </div>
            <div className="mt-3 flex justify-between text-xs text-felt-300">
              <button
                type="button"
                onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
                className="underline underline-offset-2"
              >
                {mode === 'signin' ? 'Need an account? Sign up' : 'Have an account? Sign in'}
              </button>
              <button
                type="button"
                onClick={handleMagicLink}
                className="underline underline-offset-2 disabled:opacity-50"
                disabled={!email}
              >
                Magic link
              </button>
            </div>
          </form>
          )}
          <div className="flex flex-wrap gap-2">
            {['n new', '/ search', '? keys'].map((k) => (
              <span
                key={k}
                className="rounded-md border border-felt-700 px-2 py-1 font-mono text-[11px] font-semibold text-felt-300"
              >
                {k}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
