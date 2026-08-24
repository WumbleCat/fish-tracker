/** The front door, dealt on the felt: six chip tiles for the code, a name,
 * and "Deal me in" — the guest path is the whole left side because the
 * person using it is standing in a kitchen with the code read aloud.
 * Hosts and regulars sign in from the card on the right. Always dark, in
 * either theme: this screen is the identity, not a surface. */

import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';

import { CODE_LENGTH, CodeTiles } from '../components/CodeTiles';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { stashPendingPayout } from '../lib/pending-payout';
import { supabase } from '../lib/supabase';

export function joinErrorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    switch (e.code) {
      case 'game_not_found':
        return 'No game with that code — check it and try again.';
      case 'game_not_joinable':
        return "That game isn't accepting players right now.";
      case 'table_full':
        return 'That table is full — nine seats, all taken.';
      case 'guest_unavailable':
        return 'Guest joining is unavailable right now — sign in instead.';
    }
  }
  return 'Could not join — try again.';
}

const field =
  'w-full rounded-full border border-felt-700 bg-white/5 px-6 py-4 text-[17px] text-felt-100 placeholder:text-felt-600 focus:border-emerald-400 focus:outline-none';
const cardField =
  'w-full rounded-xl border border-felt-700 bg-white/5 px-4 py-3 text-sm text-felt-100 placeholder:text-felt-600 focus:border-emerald-400 focus:outline-none';

export function Landing({ initialCode = '' }: { initialCode?: string }) {
  const navigate = useNavigate();
  const { startGuestSession } = useAuth();

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
  // optional at sign-up; saved on the first signed-in load (email confirms first)
  const [bankOpen, setBankOpen] = useState(false);
  const [bank, setBank] = useState({
    account_name: '',
    bank_name: '',
    sort_code: '',
    account_number: '',
    revolut_link: '',
  });
  const setBankField = (key: keyof typeof bank, value: string) =>
    setBank((b) => ({ ...b, [key]: value }));

  const ready = joinCode.length === CODE_LENGTH && guestName.trim().length > 0;

  const handleGuestJoin = async (event: FormEvent) => {
    event.preventDefault();
    if (!ready || joining) return;
    setJoinError(null);
    setJoining(true);
    try {
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
      stashPendingPayout({
        account_name: bank.account_name || null,
        bank_name: bank.bank_name || null,
        sort_code: /^[0-9]{6}$/.test(bank.sort_code) ? bank.sort_code : null,
        account_number: /^[0-9]{8}$/.test(bank.account_number) ? bank.account_number : null,
        revolut_link: bank.revolut_link || null,
      });
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
      className="mx-auto mt-4 max-w-6xl rounded-3xl bg-felt-950 px-16 py-[72px] text-felt-100"
      style={{
        background: 'radial-gradient(80% 120% at 15% 0%, #183025 0%, #0d1512 55%, #0b1210 100%)',
      }}
    >
      <div className="flex items-center gap-14">
        <form onSubmit={handleGuestJoin} className="flex flex-1 flex-col gap-6" aria-label="join a game">
          <div className="flex items-baseline gap-3">
            <h1 className="text-[34px] font-bold tracking-tight">Sit down</h1>
            <span className="num text-[13px] tracking-[0.1em] text-emerald-400">
              {CODE_LENGTH} CHARACTERS
            </span>
          </div>
          <CodeTiles value={joinCode} onChange={setJoinCode} autoFocus={!initialCode} />
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
          {joinError && (
            <p role="alert" className="text-sm text-rose-400">
              {joinError}
            </p>
          )}
          <div className="flex items-center gap-4">
            <button
              type="submit"
              className={`rounded-full px-10 py-4 text-[17px] font-extrabold transition ${
                ready ? 'bg-emerald-400 text-emerald-950 hover:brightness-105' : 'bg-felt-700 text-felt-300'
              }`}
            >
              Deal me in
            </button>
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
          </div>
        </form>

        <div className="flex w-[300px] flex-col gap-3.5">
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
              {mode === 'signup' && (
                <div className="rounded-xl border border-felt-700 p-2.5">
                  <button
                    type="button"
                    onClick={() => setBankOpen((o) => !o)}
                    className="flex w-full items-center justify-between text-left text-xs text-felt-300"
                    aria-expanded={bankOpen}
                  >
                    <span>Bank details for getting paid (optional)</span>
                    <span className="text-felt-600">{bankOpen ? 'hide' : 'add'}</span>
                  </button>
                  {bankOpen && (
                    <div className="mt-2 flex flex-col gap-2">
                      <input
                        value={bank.account_name}
                        onChange={(e) => setBankField('account_name', e.target.value)}
                        placeholder="Account name"
                        className={cardField}
                        aria-label="account name"
                      />
                      <input
                        value={bank.bank_name}
                        onChange={(e) => setBankField('bank_name', e.target.value)}
                        placeholder="Bank (e.g. Monzo)"
                        className={cardField}
                        aria-label="bank name"
                      />
                      <div className="flex gap-2">
                        <input
                          value={bank.sort_code}
                          onChange={(e) =>
                            setBankField('sort_code', e.target.value.replace(/[^0-9]/g, ''))
                          }
                          placeholder="Sort code"
                          maxLength={6}
                          inputMode="numeric"
                          className={`num ${cardField}`}
                          aria-label="sort code"
                        />
                        <input
                          value={bank.account_number}
                          onChange={(e) =>
                            setBankField('account_number', e.target.value.replace(/[^0-9]/g, ''))
                          }
                          placeholder="Account no."
                          maxLength={8}
                          inputMode="numeric"
                          className={`num ${cardField}`}
                          aria-label="account number"
                        />
                      </div>
                      <input
                        value={bank.revolut_link}
                        onChange={(e) => setBankField('revolut_link', e.target.value.trim())}
                        placeholder="revolut.me/yourname"
                        className={cardField}
                        aria-label="revolut link"
                      />
                      <p className="text-[11px] text-felt-600">
                        Saved to your account once you've confirmed your email.
                      </p>
                    </div>
                  )}
                </div>
              )}
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
