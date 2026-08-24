/** Renders what the API computed — never recomputes payments. The
 * reconciliation banner sits ABOVE the payments and gates them: an
 * unacknowledged discrepancy hides the list entirely. */

import { ClipboardCopy } from 'lucide-react';
import { useState } from 'react';

import { settlementSummary } from '../lib/clipboard';
import { fmtMinor } from '../lib/money';
import type { Game, PayoutDetailsMasked, Settlement } from '../lib/types';
import { Amount } from './Amount';
import { PayoutBlock } from './PayoutBlock';

export function SettlementPanel({
  game,
  settlement,
  payoutDetails,
  isHost,
  onClose,
}: {
  game: Game;
  settlement: Settlement;
  /** null for guests — the API refuses them and nothing is rendered. */
  payoutDetails: PayoutDetailsMasked[] | null;
  isHost: boolean;
  onClose?: (acknowledgeDiscrepancy: boolean) => void;
}) {
  const { currency, currency_exponent: exponent } = game;
  const [acknowledged, setAcknowledged] = useState(false);
  const [copied, setCopied] = useState(false);
  const nameOf = (id: string) =>
    game.members.find((m) => m.user_id === id)?.display_name ?? 'unknown';

  const detailFor = (userId: string) =>
    payoutDetails?.find((d) => d.user_id === userId) ?? null;
  const hostDetails = detailFor(game.host_id);
  const isGbp = currency === 'GBP';

  const mismatch = settlement.discrepancy_minor !== 0;
  const gated = mismatch && !settlement.final && !acknowledged;
  // The counter: identical rows in every state, no prose. The GAP row is
  // the reconciliation surface — amber and gating when nonzero, ✓ when not.
  const buyIns = game.totals.verified_buy_ins_minor;
  const cashOuts = game.totals.verified_cash_outs_minor;

  return (
    <section aria-label="settlement" className="space-y-3">
      <dl
        data-testid="settle-counter"
        className="divide-y divide-neutral-100 rounded border border-neutral-200 bg-white text-sm"
      >
        <div className="flex items-center justify-between px-3 py-2">
          <dt className="text-xs uppercase tracking-wide text-neutral-500">Buy-ins</dt>
          <dd className="num font-medium">{fmtMinor(buyIns, currency, exponent)}</dd>
        </div>
        <div className="flex items-center justify-between px-3 py-2">
          <dt className="text-xs uppercase tracking-wide text-neutral-500">Cash-outs</dt>
          <dd className="num font-medium">{fmtMinor(cashOuts, currency, exponent)}</dd>
        </div>
        <div
          data-testid="settle-gap"
          role={mismatch ? 'alert' : undefined}
          className={`flex items-center justify-between px-3 py-2 ${
            mismatch ? 'bg-amber-50' : ''
          }`}
        >
          <dt
            className={`text-xs font-semibold uppercase tracking-wide ${
              mismatch ? 'text-amber-800' : 'text-neutral-500'
            }`}
          >
            Gap
          </dt>
          <dd className="num flex items-center gap-2 font-semibold">
            {mismatch ? (
              <>
                {fmtMinor(Math.abs(settlement.discrepancy_minor), currency, exponent)}
                <span className="rounded-full bg-amber-200 px-2 py-0.5 text-xs font-bold text-amber-900">
                  {settlement.discrepancy_minor > 0 ? 'short' : 'over'}
                </span>
              </>
            ) : (
              <span className="text-emerald-700">
                {fmtMinor(0, currency, exponent)} ✓
              </span>
            )}
          </dd>
        </div>
        {settlement.pending_count > 0 && (
          <div className="flex items-center justify-between bg-amber-50 px-3 py-2">
            <dt className="text-xs font-semibold uppercase tracking-wide text-amber-800">
              Pending
            </dt>
            <dd className="num font-semibold text-amber-800">{settlement.pending_count}</dd>
          </div>
        )}
      </dl>

      {mismatch && !settlement.final && (
        <label className="flex items-center gap-2 text-sm text-amber-900">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
          />
          settle with gap on record
        </label>
      )}
      {mismatch && settlement.final && settlement.acknowledged_by && (
        <p className="num text-xs text-neutral-500">
          gap on record · {nameOf(settlement.acknowledged_by)}
        </p>
      )}

      {gated ? null : (
        <>
          <ol aria-label="payments" className="space-y-2">
            {settlement.payments.length === 0 && (
              <li className="text-sm text-neutral-500">All square — no payments needed.</li>
            )}
            {settlement.payments.map((p, i) => {
              const payee = detailFor(p.to_user);
              return (
                <li key={i} className="rounded border border-neutral-200 bg-white px-3 py-2 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{nameOf(p.from_user)}</span>
                    <span className="text-neutral-400">→</span>
                    <span className="font-medium">{nameOf(p.to_user)}</span>
                    <span className="ml-auto font-semibold">
                      <Amount minor={p.amount_minor} currency={currency} exponent={exponent} />
                    </span>
                  </div>
                  {payee && (
                    <div className="mt-2">
                      <PayoutBlock details={payee} isGbp={isGbp} />
                    </div>
                  )}
                </li>
              );
            })}
          </ol>

          <button
            className="flex items-center gap-1.5 rounded border border-neutral-300 px-2.5 py-1.5 text-xs text-neutral-700 hover:bg-neutral-100"
            onClick={async () => {
              // names and amounts only — bank details never enter the summary
              await navigator.clipboard.writeText(
                settlementSummary(
                  game.name,
                  settlement.payments,
                  nameOf,
                  currency,
                  exponent,
                  settlement.final ? settlement.discrepancy_minor : 0,
                ),
              );
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            <ClipboardCopy size={13} /> {copied ? 'Copied' : 'Copy summary for the group chat'}
          </button>
        </>
      )}

      {hostDetails && (
        <PayoutBlock details={hostDetails} isGbp={isGbp} title="Pay the host (banker)" />
      )}

      {isHost && !settlement.final && game.state === 'settling' && (
        <button
          disabled={settlement.pending_count > 0 || gated}
          onClick={() => onClose?.(mismatch && acknowledged)}
          className="w-full rounded bg-neutral-900 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-neutral-300"
        >
          Close game and record settlement
        </button>
      )}
    </section>
  );
}
