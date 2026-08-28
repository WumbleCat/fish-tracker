/** The entry sheet: amount first, keypad already live, chips for the common
 * amounts. A standard rebuy is open → confirm, two taps, no typing.
 *
 * Cash-out uses the same sheet but the amount must be typed in full — no
 * default, no chips. That number decides what people get paid; a pre-filled
 * cash-out is an invitation to accept a wrong one.
 *
 * The host also logs for players who are not using the app (app-logic,
 * 2026-08-28). That is one row of chips at the top, "Me" already chosen, so
 * the common case is still open → confirm. Nobody else sees the row: a
 * player can only ever log their own. */

import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Text } from './Text';

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
  seatFor = [],
  defaultTargetUserId = null,
  onSubmit,
}: {
  currency: string;
  exponent: number;
  stakeMinor: number | null;
  lastAmountMinor: number | null;
  defaultType?: EntryType;
  allowedTypes?: EntryType[];
  /** Other seated players this person may log for — host only, empty for
   * everyone else. */
  seatFor?: { userId: string; name: string }[];
  defaultTargetUserId?: string | null;
  /** targetUserId is null when the entry is the logger's own. */
  onSubmit: (entryType: EntryType, amountMinor: number, targetUserId: string | null) => void;
}) {
  const [entryType, setEntryType] = useState<EntryType>(defaultType);
  const [target, setTarget] = useState<string | null>(defaultTargetUserId);
  const targetName = seatFor.find((p) => p.userId === target)?.name ?? null;
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
    onSubmit(entryType, minor, target);
  };

  return (
    <View testID="entry-sheet" style={{ padding: 16, gap: 14 }}>
      {seatFor.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8, paddingRight: 8 }}
        >
          {[{ userId: null as string | null, name: 'Me' }, ...seatFor].map((p) => (
            <Pressable
              key={p.userId ?? 'me'}
              testID={`for-${p.userId ?? 'me'}`}
              onPress={() => setTarget(p.userId)}
              style={{
                minHeight: 44,
                paddingHorizontal: 14,
                borderRadius: 22,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: target === p.userId ? '#059669' : '#1a2620',
              }}
            >
              <Text style={{ color: '#e7ece9', fontWeight: '600' }}>
                {p.userId === null ? 'Me' : `for ${p.name}`}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

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
          {targetName ? ` for ${targetName}` : ''}
        </Text>
      </Pressable>
    </View>
  );
}
