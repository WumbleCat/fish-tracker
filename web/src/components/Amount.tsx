/** The one way an amount reaches the screen. Sign is carried by the +/−
 * character first and colour second — colour is never the only signal. */

import { fmtMinor, fmtSigned } from '../lib/money';

export function Amount({
  minor,
  currency,
  exponent,
  signed = false,
  className = '',
}: {
  minor: number;
  currency: string;
  exponent: number;
  signed?: boolean;
  className?: string;
}) {
  const text = signed ? fmtSigned(minor, currency, exponent) : fmtMinor(minor, currency, exponent);
  const tone = minor > 0 ? 'win' : minor < 0 ? 'loss' : '';
  return <span className={`num ${signed ? tone : ''} ${className}`.trim()}>{text}</span>;
}

export function PendingAmount({
  minor,
  currency,
  exponent,
}: {
  minor: number;
  currency: string;
  exponent: number;
}) {
  if (minor === 0) return null;
  return (
    <span className="num pending-figure text-xs" title="awaiting verification">
      {fmtSigned(minor, currency, exponent)} awaiting verification
    </span>
  );
}
