/** A big numeric keypad for a dim room. Digits, decimal (when the game's
 * exponent allows one), backspace. Targets well above 44dp. */

import { Pressable, View } from 'react-native';
import { Text } from './Text';

const KEY_HEIGHT = 56;

export function Keypad({
  exponent,
  onKey,
  onBackspace,
}: {
  exponent: number;
  onKey: (key: string) => void;
  onBackspace: () => void;
}) {
  const rows = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    [exponent > 0 ? '.' : '', '0', '⌫'],
  ];
  return (
    <View style={{ gap: 8 }}>
      {rows.map((row, i) => (
        <View key={i} style={{ flexDirection: 'row', gap: 8 }}>
          {row.map((key, j) =>
            key === '' ? (
              <View key={j} style={{ flex: 1 }} />
            ) : (
              <Pressable
                key={j}
                testID={`key-${key}`}
                onPress={() => (key === '⌫' ? onBackspace() : onKey(key))}
                style={{
                  flex: 1,
                  height: KEY_HEIGHT,
                  borderRadius: 12,
                  backgroundColor: '#1a2620',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ color: '#e7ece9', fontSize: 24, fontWeight: '600' }}>{key}</Text>
              </Pressable>
            ),
          )}
        </View>
      ))}
    </View>
  );
}
