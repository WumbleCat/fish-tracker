import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { api } from '../lib/api';
import { useMe } from '../lib/queries';
import type { User } from '../lib/types';

export function Settings() {
  const queryClient = useQueryClient();
  const { data: me } = useMe(true);
  const [displayName, setDisplayName] = useState('');
  const [accountName, setAccountName] = useState('');
  const [bankName, setBankName] = useState('');
  const [sortCode, setSortCode] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [paymentReference, setPaymentReference] = useState('');
  const [revolutLink, setRevolutLink] = useState('');
  const [saved, setSaved] = useState<string | null>(null);
  const [undone, setUndone] = useState<string | null>(null);

  useEffect(() => {
    if (me) setDisplayName(me.display_name);
  }, [me]);

  const flash = (what: string) => {
    setSaved(what);
    setTimeout(() => setSaved(null), 1500);
  };

  // The name shows as saved the moment you press Save; a refusal puts the
  // old name back and says so.
  const saveProfile = useMutation({
    mutationFn: () => api.updateMe({ display_name: displayName }),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['me'] });
      const previous = queryClient.getQueryData<User>(['me']);
      if (previous) queryClient.setQueryData<User>(['me'], { ...previous, display_name: displayName });
      flash('profile');
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(['me'], ctx.previous);
      setUndone(`Undid display name → "${displayName}": not saved.`);
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ['me'] }),
  });

  const saveDetails = useMutation({
    mutationFn: () =>
      api.putPayoutDetails({
        account_name: accountName || null,
        bank_name: bankName || null,
        sort_code: sortCode || null,
        account_number: accountNumber || null,
        payment_reference: paymentReference || null,
        revolut_link: revolutLink || null,
      }),
    onMutate: () => flash('details'),
    onError: () => setUndone('Payout details were not saved — the previous details still apply.'),
  });

  const sortCodeValid = sortCode === '' || /^[0-9]{6}$/.test(sortCode);
  const accountNumberValid = accountNumber === '' || /^[0-9]{8}$/.test(accountNumber);
  const revolutValid =
    revolutLink === '' || /^(https:\/\/)?revolut\.me\/[A-Za-z0-9._-]{2,64}$/.test(revolutLink);

  return (
    <div className="mx-auto max-w-lg space-y-6">
      {undone && (
        <p role="alert" className="flex items-center gap-3 rounded bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <span>{undone}</span>
          <button onClick={() => setUndone(null)} className="ml-auto text-xs underline">
            dismiss
          </button>
        </p>
      )}
      <section className="rounded border border-neutral-200 bg-white p-4">
        <h2 className="text-sm font-semibold">Profile</h2>
        <form
          className="mt-3 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            saveProfile.mutate();
          }}
        >
          <label className="block text-xs text-neutral-600">
            Display name
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="mt-1 w-full rounded border border-neutral-300 px-3 py-2 text-sm"
            />
          </label>
          <button className="rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white">
            Save {saved === 'profile' && '✓'}
          </button>
        </form>
        <p className="mt-2 text-xs text-neutral-400">
          Default currency lives in the header bar — it applies to new games and your history
          display, never to an existing ledger.
        </p>
      </section>

      <section className="rounded border border-neutral-200 bg-white p-4">
        <h2 className="text-sm font-semibold">Payout details</h2>
        <p className="mt-1 text-xs text-neutral-500">
          Optional. Shown only to people settling a game with you, so they can pay you without a
          shouted sort code. The app never verifies an account exists — check your typing.
        </p>
        <form
          className="mt-3 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (sortCodeValid && accountNumberValid && revolutValid) saveDetails.mutate();
          }}
        >
          <div className="flex gap-3">
            <label className="block flex-1 text-xs text-neutral-600">
              Account name
              <input
                value={accountName}
                onChange={(e) => setAccountName(e.target.value)}
                className="mt-1 w-full rounded border border-neutral-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="block flex-1 text-xs text-neutral-600">
              Bank
              <input
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                placeholder="e.g. Monzo"
                className="mt-1 w-full rounded border border-neutral-300 px-3 py-2 text-sm"
              />
            </label>
          </div>
          <div className="flex gap-3">
            <label className="block flex-1 text-xs text-neutral-600">
              Sort code (6 digits)
              <input
                value={sortCode}
                onChange={(e) => setSortCode(e.target.value.replace(/[^0-9]/g, ''))}
                maxLength={6}
                inputMode="numeric"
                className={`num mt-1 w-full rounded border px-3 py-2 text-sm ${
                  sortCodeValid ? 'border-neutral-300' : 'border-rose-400'
                }`}
              />
            </label>
            <label className="block flex-1 text-xs text-neutral-600">
              Account number (8 digits)
              <input
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value.replace(/[^0-9]/g, ''))}
                maxLength={8}
                inputMode="numeric"
                className={`num mt-1 w-full rounded border px-3 py-2 text-sm ${
                  accountNumberValid ? 'border-neutral-300' : 'border-rose-400'
                }`}
              />
            </label>
          </div>
          <label className="block text-xs text-neutral-600">
            Payment reference (for non-GBP games: IBAN, payment link, whatever the group uses)
            <input
              value={paymentReference}
              onChange={(e) => setPaymentReference(e.target.value)}
              className="mt-1 w-full rounded border border-neutral-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-xs text-neutral-600">
            Revolut link (e.g. revolut.me/yourname)
            <input
              value={revolutLink}
              onChange={(e) => setRevolutLink(e.target.value.trim())}
              placeholder="revolut.me/yourname"
              className={`mt-1 w-full rounded border px-3 py-2 text-sm ${
                revolutValid ? 'border-neutral-300' : 'border-rose-400'
              }`}
            />
            {!revolutValid && (
              <span className="text-rose-700">Looks off — expected revolut.me/yourname</span>
            )}
          </label>
          <button className="rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white">
            Save details {saved === 'details' && '✓'}
          </button>
        </form>
      </section>
    </div>
  );
}
