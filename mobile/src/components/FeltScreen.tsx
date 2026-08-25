/** The frame every first-run screen sits in: felt, safe area, keyboard, and
 * a column that is the same width whatever the phone.
 *
 * Three things this fixes, all of which only show up on hardware:
 *  - the notch and the home indicator, which a centred `flex:1` column
 *    happily renders underneath;
 *  - the keyboard, which on a 568pt screen covers the button someone is
 *    reaching for — the content scrolls instead of being squeezed;
 *  - Android, where `KeyboardAvoidingView` does nothing without a behavior.
 */

import { type ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { frontDoorMetrics } from '../lib/layout';
import { FeltBackdrop } from './FeltBackdrop';

export function FeltScreen({
  children,
  glow = true,
}: {
  children: ReactNode;
  glow?: boolean;
}) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const m = frontDoorMetrics(width, height);

  return (
    <View style={{ flex: 1 }}>
      <FeltBackdrop glow={glow} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          // flexGrow + centre keeps the column vertically centred when it
          // fits and lets it scroll when the keyboard leaves no room.
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: 'center',
            paddingHorizontal: m.pad,
            paddingTop: insets.top + m.gap,
            paddingBottom: insets.bottom + m.gap,
          }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
          alwaysBounceVertical={false}
        >
          <View style={{ width: m.contentWidth, alignSelf: 'center', gap: m.gap }}>
            {children}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
