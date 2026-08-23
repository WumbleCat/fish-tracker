import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { api } from '../lib/api';
import { useMe } from '../lib/queries';

export function Settings() {
  const queryClient = useQueryClient();
  const { data: me } = useMe(true);
  const [displayName, setDisplayName] = useState('');
  const [accountName, setAccountName] = useState('');
  const [sortCode, setSortCode] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [paymentReference, setPaymentReference] = useState('');
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    if (me) setDisplayName(me.display_name);
  }, [me]);

  const saveProfile = useMutation({
    mutationFn: () => api.updateMe({ display_name: displayName }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['me'] });
      setSaved('profile');
      setTimeout(() => setSaved(null), 1500);
    },
  });

  const saveDetails = useMutation({
    mutationFn: () =>
      api.putPayoutDetails({
        account_name: accountName || null,
        sort_code: sortCode || null,
        account_number: accountNumber || null,
        payment_reference: paymentReference || null,
      }),
    onSuccess: () => {
      setSaved('details');
      setTimeout(() => setSaved(null), 1500);
    },
  });

  const sortCodeValid = sortCode === '' || /^[0-9]{6}$/.test(sortCode);
  const accountNumberValid = accountNumber === '' || /^[0-9]{8}$/.test(accountNumber);

  return (
    <div className="mx-auto max-w-lg space-y-6">
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
            if (sortCodeValid && accountNumberValid) saveDetails.mutate();
          }}
        >
          <label className="block text-xs text-neutral-600">
            Account name
            <input
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
              className="mt-1 w-full rounded border border-neutral-300 px-3 py-2 text-sm"
            />
          </label>
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
          <button className="rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white">
            Save details {saved === 'details' && '✓'}
          </button>
        </form>
      </section>
    </div>
  );
}
