/** Haptics for state changes only — nothing vibrates without one. */

import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

const canBuzz = Platform.OS === 'ios' || Platform.OS === 'android';

export function confirmHaptic(): void {
  if (canBuzz) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
}

export function rejectHaptic(): void {
  if (canBuzz) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
}
