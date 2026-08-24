/** Load the house fonts before the first screen paints, and hold the splash
 * until they are in — a label that swaps face after a frame reads as a
 * glitch. With no sources listed this resolves immediately. */

import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';

import { fontSources } from './font-sources';

export const APP_FONT = 'Apercu-Medium';

void SplashScreen.preventAutoHideAsync().catch(() => {
  /* already hidden (e.g. web, or a fast reload): nothing to hold */
});

export function useAppFonts(): boolean {
  const [loaded, error] = useFonts(fontSources);
  const ready = loaded || !!error;
  useEffect(() => {
    if (ready) void SplashScreen.hideAsync().catch(() => undefined);
  }, [ready]);
  return ready;
}
