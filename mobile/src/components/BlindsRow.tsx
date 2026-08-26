/** The table's stakes on the game screen, and the host's way to change them
 * without leaving the table.
 *
 * Blinds are not ledger money: nothing here touches an entry, a net or a
 * total. Amounts go through parseToMinor to integer minor units — never a
 * float — and the server records each change as a game event.
 *
 * The *history* of changes is a desktop surface. This app is for capturing
 * and reading at the table, so it shows what the blinds are now.
 */

import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';

import { fmtBlinds, parseToMinor, symbolFor, toDecimalString } from '../lib/money';
import { Text } from './Text';

export function BlindsRow({
  smallMinor,
  bigMinor,
  currency,
  exponent,
  canEdit,
  onChange,
}: {
  smallMinor: number | null;
  bigMinor: number | null;
  currency: string;
  exponent: number;
  canEdit: boolean;
  onChange: (smallMinor: number, bigMinor: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [small, setSmall] = useState('');
  const [big, setBig] = useState('');
  const [error, setError] = useState<string | null>(null);

  const label = fmtBlinds(smallMinor, bigMinor, currency, exponent);

  const open = () => {
    // integer minor units all the way to the field: dividing by 10**exponent
    // to prefill would put a float in the money path for the sake of a
    // placeholder
    setSmall(smallMinor === null ? '' : toDecimalString(smallMinor, currency, exponent));
    setBig(bigMinor === null ? '' : toDecimalString(bigMinor, currency, exponent));
    setError(null);
    setEditing(true);
  };

  const save = () => {
    const s = parseToMinor(small, exponent);
    const b = parseToMinor(big, exponent);
    if (s === null || b === null || s <= 0 || b <= 0) {
      setError('Enter both blinds as positive amounts.');
      return;
    }
    if (b < s) {
      setError('The big blind cannot be smaller than the small blind.');
      return;
    }
    onChange(s, b);
    setEditing(false);
  };

  const field = {
    flex: 1,
    minWidth: 0,
    backgroundColor: '#1a2620',
    color: '#e7ece9',
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    textAlign: 'right' as const,
  };

  if (editing) {
    return (
      <View style={{ gap: 8 }}>
        <Text style={{ color: '#9fb0a8', fontSize: 12 }}>
          BLINDS ({symbolFor(currency).trim() || currency})
        </Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TextInput
            autoFocus
            value={small}
            onChangeText={setSmall}
            keyboardType="decimal-pad"
            placeholder="small"
            placeholderTextColor="#5d6f66"
            accessibilityLabel="small blind"
            style={field}
          />
          <TextInput
            value={big}
            onChangeText={setBig}
            keyboardType="decimal-pad"
            placeholder="big"
            placeholderTextColor="#5d6f66"
            accessibilityLabel="big blind"
            style={field}
          />
          <Pressable
            onPress={save}
            accessibilityRole="button"
            style={{
              minHeight: 44,
              minWidth: 64,
              paddingHorizontal: 16,
              borderRadius: 10,
              backgroundColor: '#059669',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ color: '#fff', fontWeight: '700' }}>Set</Text>
          </Pressable>
        </View>
        {error && <Text style={{ color: '#fb7185', fontSize: 13 }}>{error}</Text>}
        <Pressable onPress={() => setEditing(false)} style={{ minHeight: 44, justifyContent: 'center' }}>
          <Text style={{ color: '#5d6f66' }}>Cancel</Text>
        </Pressable>
      </View>
    );
  }

  if (!label && !canEdit) return null;

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Text style={{ color: '#9fb0a8', fontSize: 12 }}>BLINDS</Text>
      <Text style={{ color: '#e7ece9', fontVariant: ['tabular-nums'] }}>{label ?? '—'}</Text>
      <View style={{ flex: 1 }} />
      {canEdit && (
        <Pressable
          onPress={open}
          accessibilityRole="button"
          accessibilityLabel="change blinds"
          style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 }}
        >
          <Text style={{ color: '#34d399' }}>{label ? 'Change' : 'Set blinds'}</Text>
        </Pressable>
      )}
    </View>
  );
}
