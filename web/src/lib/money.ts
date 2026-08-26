/**
 * All money maths lives here. Amounts are integer minor units everywhere;
 * the exponent comes from the game, never a hard-coded 2. Components never
 * do arithmetic on amounts inline.
 */

import { dinero, type Currency } from 'dinero.js';

const SYMBOLS: Record<string, string> = {
  GBP: '£',
  EUR: '€',
  USD: '$',
  JPY: '¥',
  AUD: 'A$',
  CAD: 'C$',
};

/** True minus sign — aligns with digit width in tabular figures. */
export const MINUS = '−';

export function symbolFor(code: string): string {
  return SYMBOLS[code] ?? `${code} `;
}

function currencyOf(code: string, exponent: number): Currency<number> {
  return { code, base: 10, exponent };
}

export function assertMinor(amountMinor: number): void {
  if (!Number.isSafeInteger(amountMinor)) {
    throw new Error(`amount must be an integer count of minor units, got ${amountMinor}`);
  }
}

/** "12.34" — digits only, no symbol, exponent decimals exactly. Composed
 * with integer arithmetic; dinero validates the (amount, currency) pair but
 * its toDecimal emits a stray ".0" for zero-exponent currencies. */
export function toDecimalString(amountMinor: number, code: string, exponent: number): string {
  assertMinor(amountMinor);
  dinero({ amount: Math.abs(amountMinor), currency: currencyOf(code, exponent) });
  const abs = Math.abs(amountMinor);
  const base = 10 ** exponent;
  const whole = Math.trunc(abs / base).toString();
  if (exponent === 0) return whole;
  return `${whole}.${(abs % base).toString().padStart(exponent, '0')}`;
}

/** "£12.34" / "−£6.00" / "¥5000" — for display, at render time only. */
export function fmtMinor(amountMinor: number, code: string, exponent: number): string {
  const sign = amountMinor < 0 ? MINUS : '';
  return `${sign}${symbolFor(code)}${toDecimalString(amountMinor, code, exponent)}`;
}

/** "+£40" style, for pending deltas; zero renders as "£0.00" with no sign. */
export function fmtSigned(amountMinor: number, code: string, exponent: number): string {
  if (amountMinor > 0) return `+${symbolFor(code)}${toDecimalString(amountMinor, code, exponent)}`;
  return fmtMinor(amountMinor, code, exponent);
}

/**
 * Parse user input to minor units with integer arithmetic — never through a
 * float. Accepts "12", "12.3", "12.34", "£12.34", "1,234.56". Rejects more
 * decimals than the exponent allows, negatives, and anything non-numeric.
 */
export function parseToMinor(input: string, exponent: number): number | null {
  const cleaned = input.replace(/[£€$¥,\s]/g, '').replace(/−/g, '-');
  if (cleaned === '' || cleaned.startsWith('-')) return null;
  const match = /^(\d+)(?:\.(\d*))?$/.exec(cleaned);
  if (!match) return null;
  const whole = match[1];
  const frac = match[2] ?? '';
  if (frac.length > exponent) return null;
  const fracPadded = frac.padEnd(exponent, '0');
  const minor = parseInt(whole, 10) * 10 ** exponent + (fracPadded ? parseInt(fracPadded, 10) : 0);
  if (!Number.isSafeInteger(minor)) return null;
  return minor;
}

/** The table's stakes as one label: "£0.10/£0.20". Formatting only — blinds
 * are never arithmetic, and never enter a net or a total. */
export function fmtBlinds(
  smallMinor: number | null,
  bigMinor: number | null,
  code: string,
  exponent: number,
): string | null {
  if (smallMinor === null || bigMinor === null) return null;
  return `${fmtMinor(smallMinor, code, exponent)}/${fmtMinor(bigMinor, code, exponent)}`;
}
