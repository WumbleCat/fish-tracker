/** The host's paying-out surface: the bank details of whichever player is
 * in focus, laid out as fixed rows with a copy button at the end of each —
 * built for typing into a banking app one field at a time. Same handling
 * rules as every other payout view: masked by default, copy without
 * revealing, nothing logged. */

import { Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';

import type { PayoutDetailsMasked } from '../lib/types';
import { CopyButton, fetchFullAccountNumber } from './PayoutBlock';

function Row({
  label,
  value,
  copyLabel,
  getValue,
  extra,
}: {
  label: string;
  value: string;
  copyLabel: string;
  getValue: () => Promise<string | null>;
  extra?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 py-1.5">
      <dt className="w-32 shrink-0 text-xs text-neutral-500">{label}</dt>
      <dd className="num truncate">{value}</dd>
      <span className="ml-auto flex shrink-0 items-center">
        {extra}
        <CopyButton label={copyLabel} getValue={getValue} />
      </span>
    </div>
  );
}

export function PlayerBankCard({
  details,
  isGbp,
}: {
  details: PayoutDetailsMasked;
  isGbp: boolean;
}) {
  const [revealed, setRevealed] = useState<string | null>(null);
  const bankRows = isGbp && (details.sort_code || details.account_number_masked);
  const revolutHref = details.revolut_link
    ? details.revolut_link.startsWith('https://')
      ? details.revolut_link
      : `https://${details.revolut_link}`
    : null;

  if (!details.account_name && !bankRows && !details.payment_reference && !revolutHref) {
    return null;
  }

  return (
    <section
      aria-label={`bank details for ${details.display_name}`}
      className="rounded border border-neutral-200 bg-white p-3"
    >
      <h2 className="mb-1 flex items-baseline justify-between text-xs font-medium uppercase tracking-wide text-neutral-500">
        Bank details
        <span className="normal-case tracking-normal text-neutral-900">{details.display_name}</span>
      </h2>
      <dl className="divide-y divide-neutral-100 text-sm">
        {details.account_name && (
          <Row
            label="Account name"
            value={details.account_name}
            copyLabel="account name"
            getValue={async () => details.account_name}
          />
        )}
        {bankRows && details.sort_code && (
          <Row
            label="Sort code"
            value={details.sort_code.replace(/(\d{2})(\d{2})(\d{2})/, '$1-$2-$3')}
            copyLabel="sort code"
            getValue={async () => details.sort_code}
          />
        )}
        {bankRows && details.account_number_masked && (
          <Row
            label="Account number"
            value={revealed ?? details.account_number_masked}
            copyLabel="account number"
            getValue={() => fetchFullAccountNumber(details.user_id)}
            extra={
              <button
                aria-label={revealed ? 'hide account number' : 'reveal account number'}
                className="rounded p-1 text-neutral-400 hover:text-neutral-700"
                onClick={async () => {
                  setRevealed(revealed ? null : await fetchFullAccountNumber(details.user_id));
                }}
              >
                {revealed ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            }
          />
        )}
        {!bankRows && details.payment_reference && (
          <Row
            label="Pay via"
            value={details.payment_reference}
            copyLabel="payment reference"
            getValue={async () => details.payment_reference}
          />
        )}
        {revolutHref && (
          <Row
            label="Revolut"
            value={details.revolut_link!.replace(/^https:\/\//, '')}
            copyLabel="revolut link"
            getValue={async () => revolutHref}
          />
        )}
      </dl>
    </section>
  );
}
