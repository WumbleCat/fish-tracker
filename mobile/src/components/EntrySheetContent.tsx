/** The entry sheet: amount first, keypad already live, chips for the common
 * amounts. A standard rebuy is open → confirm, two taps, no typing.
 *
 * Cash-out uses the same sheet but the amount must be typed in full — no
 * default, no chips. That number decides what people get paid; a pre-filled
 * cash-out is an invitation to accept a wrong one. */

import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { fmtMinor, parseToMinor, toDecimalString } from '../lib/money';
import type { EntryType } from '../lib/types';
import { Keypad } from './Keypad';

const TYPES: { value: EntryType; label: string }[] = [
  { value: 'buy_in', label: 'Buy-in' },
  { value: 'rebuy', label: 'Rebuy' },
  { value: 'cash_out', label: 'Cash-out' },
];

export function EntrySheetContent({
  currency,
  exponent,
  stakeMinor,
  lastAmountMinor,
  defaultType = 'rebuy',
  allowedTypes = ['buy_in', 'rebuy', 'cash_out'],
  onSubmit,
}: {
  currency: string;
  exponent: number;
  stakeMinor: number | null;
  lastAmountMinor: number | null;
  defaultType?: EntryType;
  allowedTypes?: EntryType[];
  onSubmit: (entryType: EntryType, amountMinor: number) => void;
}) {
  const [entryType, setEntryType] = useState<EntryType>(defaultType);
  const isCashOut = entryType === 'cash_out';
  // The stake pre-fills buy-in/rebuy; a cash-out always starts empty.
  const [typed, setTyped] = useState<string>(
    !isCashOut && stakeMinor ? toDecimalString(stakeMinor, currency, exponent) : '',
  );
  const [error, setError] = useState<string | null>(null);

  const changeType = (t: EntryType) => {
    setEntryType(t);
    setError(null);
    setTyped(t !== 'cash_out' && stakeMinor ? toDecimalString(stakeMinor, currency, exponent) : '');
  };

  const chips: { label: string; minor: number }[] = isCashOut
    ? [] // never a one-tap cash-out
    : [
        ...(stakeMinor ? [{ label: `stake ${fmtMinor(stakeMinor, currency, exponent)}`, minor: stakeMinor }] : []),
        ...(stakeMinor ? [{ label: `2× ${fmtMinor(stakeMinor * 2, currency, exponent)}`, minor: stakeMinor * 2 }] : []),
        ...(lastAmountMinor && lastAmountMinor !== stakeMinor
          ? [{ label: `last ${fmtMinor(lastAmountMinor, currency, exponent)}`, minor: lastAmountMinor }]
          : []),
      ];

  const submit = () => {
    const minor = parseToMinor(typed, exponent);
    if (minor === null || minor <= 0) {
      setError(
        isCashOut
          ? 'Type the full cash-out amount — this one is never pre-filled.'
          : 'Enter a positive amount.',
      );
      return;
    }
    onSubmit(entryType, minor);
  };

  return (
    <View testID="entry-sheet" style={{ padding: 16, gap: 14 }}>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {TYPES.filter((t) => allowedTypes.includes(t.value)).map((t) => (
          <Pressable
            key={t.value}
            testID={`type-${t.value}`}
            onPress={() => changeType(t.value)}
            style={{
              flex: 1,
              minHeight: 44,
              borderRadius: 10,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: entryType === t.value ? '#059669' : '#1a2620',
            }}
          >
            <Text style={{ color: '#e7ece9', fontWeight: '600' }}>{t.label}</Text>
          </Pressable>
        ))}
      </View>

      <Text
        testID="amount-display"
        style={{
          color: '#e7ece9',
          fontSize: 40,
          fontWeight: '800',
          textAlign: 'center',
          fontVariant: ['tabular-nums'],
        }}
      >
        {typed ? `${fmtMinor(parseToMinor(typed, exponent) ?? 0, currency, exponent)}` : '—'}
      </Text>

      {chips.length > 0 && (
        <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'center' }}>
          {chips.map((chip) => (
            <Pressable
              key={chip.label}
              testID={`chip-${chip.minor}`}
              onPress={() => {
                setTyped(toDecimalString(chip.minor, currency, exponent));
                setError(null);
              }}
              style={{
                minHeight: 44,
                paddingHorizontal: 14,
                borderRadius: 22,
                backgroundColor: '#24332c',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ color: '#34d399', fontWeight: '600' }}>{chip.label}</Text>
            </Pressable>
          ))}
        </View>
      )}

      <Keypad
        exponent={exponent}
        onKey={(key) => {
          setError(null);
          setTyped((t) => {
            if (key === '.' && (t.includes('.') || exponent === 0)) return t;
            const next = t + key;
            const frac = next.split('.')[1];
            if (frac && frac.length > exponent) return t;
            return next;
          });
        }}
        onBackspace={() => setTyped((t) => t.slice(0, -1))}
      />

      {error && (
        <Text testID="entry-error" style={{ color: '#fb7185', textAlign: 'center' }}>
          {error}
        </Text>
      )}

      <Pressable
        testID="entry-confirm"
        onPress={submit}
        style={{
          height: 64,
          borderRadius: 14,
          backgroundColor: '#059669',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ color: '#fff', fontSize: 18, fontWeight: '800' }}>
          Log {TYPES.find((t) => t.value === entryType)?.label.toLowerCase()}
        </Text>
      </Pressable>
    </View>
  );
}
