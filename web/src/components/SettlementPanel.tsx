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

  return (
    <section aria-label="settlement" className="space-y-3">
      {settlement.pending_count > 0 && (
        <p className="rounded bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {settlement.pending_count} entr{settlement.pending_count === 1 ? 'y' : 'ies'} still
          awaiting verification — the game can't close until every claim is resolved.
        </p>
      )}

      {mismatch && (
        <div
          role="alert"
          className="rounded border border-amber-400 bg-amber-50 px-3 py-2 text-sm text-amber-900"
        >
          <p className="font-semibold">
            Doesn't balance: verified buy-ins exceed cash-outs by{' '}
            {fmtMinor(Math.abs(settlement.discrepancy_minor), currency, exponent)}
            {settlement.discrepancy_minor < 0 && ' (the other way round)'}
          </p>
          <p className="mt-1">
            Chips are missing or miscounted. Recount the tray, or log the missing entry —
            or acknowledge the gap to settle anyway.
          </p>
          {!settlement.final && (
            <label className="mt-2 flex items-center gap-2">
              <input
                type="checkbox"
                checked={acknowledged}
                onChange={(e) => setAcknowledged(e.target.checked)}
              />
              I've checked; settle with this discrepancy on the record
            </label>
          )}
          {settlement.final && settlement.acknowledged_by && (
            <p className="mt-1 text-xs">
              Acknowledged at close by {nameOf(settlement.acknowledged_by)}.
            </p>
          )}
        </div>
      )}

      {gated ? (
        <p className="text-sm text-neutral-500">Payments appear once the discrepancy is acknowledged.</p>
      ) : (
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
