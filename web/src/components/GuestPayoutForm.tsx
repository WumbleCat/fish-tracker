/** A guest's bank details for this one table. A guest identity exists for
 * exactly one game, so what's saved here is scoped to this session by
 * construction — and it's what co-players see when they pay them. */

import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';

import { api } from '../lib/api';

const input =
  'w-full rounded border border-neutral-300 bg-white px-3 py-1.5 text-sm placeholder:text-neutral-400';

export function GuestPayoutForm({ onSaved }: { onSaved?: () => void }) {
  const [open, setOpen] = useState(false);
  const [accountName, setAccountName] = useState('');
  const [bankName, setBankName] = useState('');
  const [sortCode, setSortCode] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [revolutLink, setRevolutLink] = useState('');
  const [saved, setSaved] = useState(false);

  const sortCodeValid = sortCode === '' || /^[0-9]{6}$/.test(sortCode);
  const accountNumberValid = accountNumber === '' || /^[0-9]{8}$/.test(accountNumber);
  const revolutValid =
    revolutLink === '' || /^(https:\/\/)?revolut\.me\/[A-Za-z0-9._-]{2,64}$/.test(revolutLink);

  const save = useMutation({
    mutationFn: () =>
      api.putPayoutDetails({
        account_name: accountName || null,
        bank_name: bankName || null,
        sort_code: sortCode || null,
        account_number: accountNumber || null,
        revolut_link: revolutLink || null,
      }),
    onSuccess: () => {
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
      onSaved?.();
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (sortCodeValid && accountNumberValid && revolutValid) save.mutate();
  };

  return (
    <section className="rounded border border-neutral-200 bg-white p-3" aria-label="your bank details">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between text-left"
        aria-expanded={open}
      >
        <span className="text-xs font-medium uppercase tracking-wide text-neutral-500">
          Your bank details · this table only
        </span>
        <span className="text-xs text-neutral-400">{open ? 'hide' : saved ? 'saved ✓' : 'add'}</span>
      </button>
      {open && (
        <form onSubmit={submit} className="mt-3 space-y-2">
          <div className="flex gap-2">
            <input
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
              placeholder="Account name"
              className={input}
              aria-label="account name"
            />
            <input
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
              placeholder="Bank"
              className={input}
              aria-label="bank name"
            />
          </div>
          <div className="flex gap-2">
            <input
              value={sortCode}
              onChange={(e) => setSortCode(e.target.value.replace(/[^0-9]/g, ''))}
              placeholder="Sort code"
              maxLength={6}
              inputMode="numeric"
              className={`num ${input} ${sortCodeValid ? '' : 'border-rose-400'}`}
              aria-label="sort code"
            />
            <input
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value.replace(/[^0-9]/g, ''))}
              placeholder="Account number"
              maxLength={8}
              inputMode="numeric"
              className={`num ${input} ${accountNumberValid ? '' : 'border-rose-400'}`}
              aria-label="account number"
            />
          </div>
          <input
            value={revolutLink}
            onChange={(e) => setRevolutLink(e.target.value.trim())}
            placeholder="revolut.me/yourname (optional)"
            className={`${input} ${revolutValid ? '' : 'border-rose-400'}`}
            aria-label="revolut link"
          />
          {save.isError && (
            <p role="alert" className="text-xs text-rose-700">
              Not saved — try again.
            </p>
          )}
          <button
            type="submit"
            className="rounded bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white"
          >
            Save {saved && '✓'}
          </button>
        </form>
      )}
    </section>
  );
}
