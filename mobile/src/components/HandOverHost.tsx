/** Handing the game to someone else, from the table (app-logic: hosts go to
 * the shop, and a game nobody can close is a real failure).
 *
 * Two taps, deliberately: choose the person, then press a button that names
 * them. On a phone a single mis-tap must not be able to give the game away —
 * only the new host can hand it back. */

import { useState } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';

import type { Member } from '../lib/types';
import { Text } from './Text';

/** Still seated, not the host already, and able to sign in as themselves —
 * `can_host` is the server's answer, so the two clients cannot drift on it.
 * A guest who joined with the code qualifies (app-logic, 2026-08-29); a
 * player the host added does not. */
export function eligibleHosts(members: Member[], hostId: string): Member[] {
  return members.filter((m) => !m.departed_at && m.can_host && m.user_id !== hostId);
}

export function HandOverHost({
  visible,
  members,
  hostId,
  pending = false,
  error = null,
  onCancel,
  onTransfer,
}: {
  visible: boolean;
  members: Member[];
  hostId: string;
  pending?: boolean;
  error?: string | null;
  onCancel: () => void;
  onTransfer: (userId: string) => void;
}) {
  const [chosen, setChosen] = useState<string | null>(null);
  const eligible = eligibleHosts(members, hostId);
  const chosenName = eligible.find((m) => m.user_id === chosen)?.display_name ?? null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View
        style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.6)',
          justifyContent: 'center',
          padding: 24,
        }}
      >
        <View style={{ backgroundColor: '#111a16', borderRadius: 16, padding: 20, gap: 12 }}>
          <Text style={{ color: '#e7ece9', fontSize: 18, fontWeight: '800' }}>Hand over host</Text>
          <Text style={{ color: '#9fb0a8', fontSize: 13 }}>
            You'll become an ordinary player: no verifying, no closing the game. Only the new
            host can hand it back.
          </Text>

          {eligible.length === 0 ? (
            <Text testID="no-eligible-host" style={{ color: '#9fb0a8', fontSize: 15 }}>
              Nobody here can take it. Everyone else at this table was added by you, so they have
              no way to sign in and hold the game — a guest who joins with the code can.
            </Text>
          ) : (
            <ScrollView style={{ maxHeight: 240 }}>
              <View style={{ gap: 8 }}>
                {eligible.map((m) => (
                  <Pressable
                    key={m.user_id}
                    testID={`host-candidate-${m.user_id}`}
                    onPress={() => setChosen(m.user_id)}
                    style={{
                      minHeight: 48,
                      borderRadius: 12,
                      paddingHorizontal: 14,
                      justifyContent: 'center',
                      backgroundColor: chosen === m.user_id ? '#059669' : '#1a2620',
                    }}
                  >
                    <Text style={{ color: '#e7ece9', fontSize: 16, fontWeight: '600' }}>
                      {m.display_name}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
          )}

          {error && (
            <Text testID="hand-over-error" style={{ color: '#fb7185' }}>
              {error}
            </Text>
          )}

          {eligible.length > 0 && (
            <Pressable
              testID="hand-over-confirm"
              onPress={() => chosen && !pending && onTransfer(chosen)}
              disabled={!chosen || pending}
              style={{
                height: 56,
                borderRadius: 14,
                backgroundColor: '#059669',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: !chosen || pending ? 0.5 : 1,
              }}
            >
              <Text style={{ color: '#fff', fontSize: 17, fontWeight: '800' }}>
                {pending
                  ? 'Handing over…'
                  : chosenName
                    ? `Make ${chosenName} the host`
                    : 'Choose a player'}
              </Text>
            </Pressable>
          )}

          <Pressable
            testID="hand-over-cancel"
            onPress={onCancel}
            style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ color: '#9fb0a8' }}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
