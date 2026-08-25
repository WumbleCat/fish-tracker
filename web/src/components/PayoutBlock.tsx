/** Bank details, handled like the sensitive things they are: masked by
 * default, explicit reveal, copy without revealing (the common case).
 * Reveal and copy fetch the full number through the direct Supabase read
 * that RLS scopes to co-players of an unsettled or recently closed game —
 * the API itself only ever returns the mask. Nothing here is logged. */

import { Check, Copy, Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';

import { supabase } from '../lib/supabase';
import type { PayoutDetailsMasked } from '../lib/types';

export async function fetchFullAccountNumber(userId: string): Promise<string | null> {
  const { data } = await supabase
    .from('payout_details')
    .select('account_number')
    .eq('user_id', userId)
    .maybeSingle();
  return data?.account_number ?? null;
}

export function CopyButton({ getValue, label }: { getValue: () => Promise<string | null>; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      aria-label={`copy ${label}`}
      className="rounded p-1 text-neutral-400 hover:text-neutral-700"
      onClick={async () => {
        const value = await getValue();
        if (value) {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }
      }}
    >
      {copied ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
    </button>
  );
}

export function PayoutBlock({
  details,
  isGbp,
  title,
}: {
  details: PayoutDetailsMasked;
  isGbp: boolean;
  title?: string;
}) {
  const [revealed, setRevealed] = useState<string | null>(null);
  const hasBankFields = isGbp && (details.sort_code || details.account_number_masked);
  const revolutHref = details.revolut_link
    ? details.revolut_link.startsWith('https://')
      ? details.revolut_link
      : `https://${details.revolut_link}`
    : null;

  if (!hasBankFields && !details.payment_reference && !revolutHref) return null;

  return (
    <div className="rounded border border-neutral-200 bg-white p-3 text-sm" aria-label="payout details">
      {title && <p className="mb-1 text-xs font-medium uppercase tracking-wide text-neutral-500">{title}</p>}
      {details.account_name && <p className="font-medium">{details.account_name}</p>}
      {hasBankFields ? (
        <dl className="mt-1 space-y-1">
          {details.sort_code && (
            <div className="flex items-center gap-2">
              <dt className="w-24 shrink-0 text-neutral-500 sm:w-28">Sort code</dt>
              <dd className="num">{details.sort_code.replace(/(\d{2})(\d{2})(\d{2})/, '$1-$2-$3')}</dd>
              <CopyButton label="sort code" getValue={async () => details.sort_code} />
            </div>
          )}
          {details.account_number_masked && (
            <div className="flex items-center gap-2">
              <dt className="w-24 shrink-0 text-neutral-500 sm:w-28">Account number</dt>
              <dd className="num min-w-0 flex-1 truncate">
                {revealed ?? details.account_number_masked}
              </dd>
              <CopyButton
                label="account number"
                getValue={() => fetchFullAccountNumber(details.user_id)}
              />
              <button
                aria-label={revealed ? 'hide account number' : 'reveal account number'}
                className="rounded p-1 text-neutral-400 hover:text-neutral-700"
                onClick={async () => {
                  if (revealed) {
                    setRevealed(null);
                  } else {
                    setRevealed(await fetchFullAccountNumber(details.user_id));
                  }
                }}
              >
                {revealed ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          )}
        </dl>
      ) : (
        details.payment_reference && (
          <div className="mt-1 flex items-start gap-2">
            <span className="shrink-0 text-neutral-500">Pay via</span>
            {/* an IBAN is one unbroken 30-odd character token — without
                anywhere to break it, it sets the width of the whole card */}
            <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
              {details.payment_reference}
            </span>
            <CopyButton label="payment reference" getValue={async () => details.payment_reference} />
          </div>
        )
      )}
      {revolutHref && (
        <div className="mt-1 flex items-start gap-2">
          <span className="shrink-0 text-neutral-500">Revolut</span>
          <a
            href={revolutHref}
            target="_blank"
            rel="noreferrer"
            className="min-w-0 flex-1 text-emerald-700 underline underline-offset-2 [overflow-wrap:anywhere]"
          >
            {details.revolut_link!.replace(/^https:\/\//, '')}
          </a>
          <CopyButton label="revolut link" getValue={async () => revolutHref} />
        </div>
      )}
    </div>
  );
}
