/** "Save my history": a guest signs up, then their guest record is claimed
 * into the new account — same ledger row, new identity, entries untouched. */

import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';

import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';

export function Claim() {
  const navigate = useNavigate();
  const { guest, refresh } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!guest) {
    return (
      <p className="mt-16 text-center text-neutral-500">
        Nothing to claim — this page is for guests saving their game history.
      </p>
    );
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { display_name: guest.displayName } },
      });
      if (signUpError) throw new Error(signUpError.message);
      await api.claim(guest.token);
      localStorage.removeItem('fish_guest');
      refresh();
      navigate(`/session/${guest.gameId}`);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'claim_target_in_game') {
        setError("That account is already in this game — it can't absorb a second seat.");
      } else if (e instanceof ApiError && e.code === 'claim_target_has_history') {
        setError('That account already has its own game history, so this record cannot merge into it.');
      } else {
        setError(e instanceof Error ? e.message : 'Claim failed');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto mt-16 max-w-sm rounded-lg border border-neutral-200 bg-white p-6">
      <h1 className="text-lg font-semibold">Save my history</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Create an account and tonight's record — buy-ins, cash-out, the lot — becomes yours for
        good. Nothing moves; your row just gains a login.
      </p>
      <form onSubmit={handleSubmit} className="mt-4 space-y-3">
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
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password (8+ characters)"
          className="w-full rounded border border-neutral-300 px-3 py-2 text-sm"
        />
        {error && (
          <p role="alert" className="text-sm text-rose-700">
            {error}
          </p>
        )}
        <button
          disabled={busy}
          className="w-full rounded bg-emerald-700 px-3 py-2 text-sm font-medium text-white disabled:bg-neutral-300"
        >
          Create account & claim
        </button>
      </form>
    </div>
  );
}
