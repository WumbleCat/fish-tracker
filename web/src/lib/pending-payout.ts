/** Bank details typed at sign-up can't be saved until the account exists
 * (hosted Supabase confirms by email first), so they wait in this browser
 * and are saved on the first signed-in load. Never logged, never sent
 * anywhere but the payout endpoint. */

import { useEffect } from 'react';

import { api } from './api';

const KEY = 'fish_pending_payout';

export interface PendingPayout {
  account_name?: string | null;
  bank_name?: string | null;
  sort_code?: string | null;
  account_number?: string | null;
  revolut_link?: string | null;
}

export function stashPendingPayout(details: PendingPayout): void {
  const any = Object.values(details).some((v) => v && String(v).trim());
  try {
    if (any) localStorage.setItem(KEY, JSON.stringify(details));
    else localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable: the details are simply not remembered */
  }
}

export function readPendingPayout(): PendingPayout | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as PendingPayout) : null;
  } catch {
    return null;
  }
}

/** Once signed in, save whatever was stashed at sign-up, then forget it. */
export function useFlushPendingPayout(signedIn: boolean): void {
  useEffect(() => {
    if (!signedIn) return;
    const pending = readPendingPayout();
    if (!pending) return;
    api
      .putPayoutDetails(pending)
      .then(() => localStorage.removeItem(KEY))
      .catch(() => {
        /* keep it for the next load; the settings page shows the fields anyway */
      });
  }, [signedIn]);
}
