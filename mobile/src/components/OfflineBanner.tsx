/** Persistent, unobtrusive; queued entries visible and counted. */

import { Text, View } from 'react-native';

import { useOnline } from '../lib/online';
import { useEntryQueue } from '../lib/queue';

export function OfflineBanner() {
  const online = useOnline((s) => s.online);
  const queued = useEntryQueue((s) => s.entries.length);
  if (online && queued === 0) return null;
  return (
    <View
      testID="offline-banner"
      style={{
        backgroundColor: online ? 'rgba(52,211,153,0.12)' : 'rgba(251,191,36,0.15)',
        paddingVertical: 6,
        paddingHorizontal: 14,
      }}
    >
      <Text style={{ color: online ? '#34d399' : '#fbbf24', fontSize: 12 }}>
        {online
          ? `Reconnected — sending ${queued} saved entr${queued === 1 ? 'y' : 'ies'}…`
          : `You're offline — entries are saved on this phone${queued ? ` (${queued} waiting)` : ''} and will send when you're back.`}
      </Text>
    </View>
  );
}
