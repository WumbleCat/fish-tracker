/** The one way an amount reaches the screen. Sign carried by +/− first,
 * colour second — never colour alone. Tabular figures throughout. */

import { Text, type TextStyle } from 'react-native';

import { fmtMinor, fmtSigned } from '../lib/money';

const base: TextStyle = { fontVariant: ['tabular-nums'], color: '#e7ece9' };

export function AmountText({
  minor,
  currency,
  exponent,
  signed = false,
  size = 16,
  bold = false,
}: {
  minor: number;
  currency: string;
  exponent: number;
  signed?: boolean;
  size?: number;
  bold?: boolean;
}) {
  const tone = signed ? (minor > 0 ? '#34d399' : minor < 0 ? '#fb7185' : '#e7ece9') : '#e7ece9';
  return (
    <Text
      style={[base, { fontSize: size, color: tone, fontWeight: bold ? '700' : '400' }]}
      accessibilityLabel={`amount ${signed ? fmtSigned(minor, currency, exponent) : fmtMinor(minor, currency, exponent)}`}
    >
      {signed ? fmtSigned(minor, currency, exponent) : fmtMinor(minor, currency, exponent)}
    </Text>
  );
}

/** A visibly provisional chip — muted amber, never sharing the net's style. */
export function PendingChip({
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
    <Text
      style={{
        fontVariant: ['tabular-nums'],
        color: '#fbbf24',
        fontSize: 12,
        fontStyle: 'italic',
        backgroundColor: 'rgba(251,191,36,0.12)',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 6,
        overflow: 'hidden',
      }}
    >
      {fmtSigned(minor, currency, exponent)} pending
    </Text>
  );
}
