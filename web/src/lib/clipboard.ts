/** The settlement summary that gets pasted into a group chat. Names and
 * amounts only — bank details never enter this string, by construction:
 * the builder does not even accept them as input. */

import { fmtMinor } from './money';
import type { Payment } from './types';

export function settlementSummary(
  gameName: string,
  payments: Payment[],
  nameOf: (userId: string) => string,
  currency: string,
  exponent: number,
  discrepancyMinor: number,
): string {
  const lines = [
    `${gameName} — settlement`,
    ...payments.map(
      (p) =>
        `${nameOf(p.from_user)} → ${nameOf(p.to_user)}: ${fmtMinor(p.amount_minor, currency, exponent)}`,
    ),
  ];
  if (payments.length === 0) lines.push('All square — no payments needed.');
  if (discrepancyMinor !== 0) {
    lines.push(
      `Note: game closed ${fmtMinor(Math.abs(discrepancyMinor), currency, exponent)} ` +
        `${discrepancyMinor > 0 ? 'short' : 'over'} (acknowledged by host).`,
    );
  }
  return lines.join('\n');
}
