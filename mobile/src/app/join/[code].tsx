/** mobile://join/CODE and https://fish-tracker-app.vercel.app/join/CODE
 * (via app links) land here; the front door does the rest with the code
 * already in the tiles. */

import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';

export default function JoinLink() {
  const { code } = useLocalSearchParams<{ code: string }>();
  useEffect(() => {
    router.replace({ pathname: '/', params: { code: code ?? '' } });
  }, [code]);
  return null;
}
