/** Push registration: the host isn't staring at the app; notifications are
 * what keeps the ledger current. The token goes to the API, which sends via
 * Expo push when a pending entry needs the host. */

import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { api } from './api';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export async function registerForPush(): Promise<boolean> {
  if (!Device.isDevice) return false; // simulators can't receive push
  const { status: existing } = await Notifications.getPermissionsAsync();
  let status = existing;
  if (existing !== 'granted') {
    ({ status } = await Notifications.requestPermissionsAsync());
  }
  if (status !== 'granted') return false;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.HIGH,
    });
  }
  const token = (await Notifications.getExpoPushTokenAsync()).data;
  await api.registerPushToken(token);
  return true;
}
