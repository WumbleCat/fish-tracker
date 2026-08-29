/** Taking someone off the table, from the table (app-logic: "Admit / remove
 * player: host only").
 *
 * Two taps, like handing over the game: choose the person, then press a
 * button that names them. On a phone a single mis-tap must not be able to
 * empty a seat — and this control never sits near the entry button.
 *
 * The word the screen exists to defuse is "remove". Nothing is deleted:
 * their entries and their net stay, and an unresolved position is still the
 * host's problem afterwards. It says so once the person is chosen, because
 * that is when the warning is about somebody in particular. */

import { useState } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';

import { playersInPlay } from '../lib/ledger';
import type { Entry, Member } from '../lib/types';
import { Text } from './Text';

/** Still seated, and not the host. The host leaves by handing the game over,
 * which is a different act; somebody already gone holds no seat to take. */
export function removableMembers(members: Member[], hostId: string): Member[] {
  return members.filter((m) => !m.departed_at && m.user_id !== hostId);
}

export function RemovePlayer({
  visible,
  members,
  hostId,
  entries,
  pending = false,
  error = null,
  onCancel,
  onRemove,
}: {
  visible: boolean;
  members: Member[];
  hostId: string;
  /** The game's entries, to say whether the chosen person still holds chips. */
  entries: Entry[];
  pending?: boolean;
  error?: string | null;
  onCancel: () => void;
  onRemove: (userId: string) => void;
}) {
  const [chosen, setChosen] = useState<string | null>(null);
  const removable = removableMembers(members, hostId);
  const chosenName = removable.find((m) => m.user_id === chosen)?.display_name ?? null;
  const holdsChips = chosen ? playersInPlay(entries).has(chosen) : false;
  const hasPending = chosen
    ? entries.some((e) => e.user_id === chosen && e.state === 'pending')
    : false;

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
          <Text style={{ color: '#e7ece9', fontSize: 18, fontWeight: '800' }}>Remove a player</Text>
          <Text style={{ color: '#9fb0a8', fontSize: 13 }}>
            They give up their seat. Everything they logged stays in the ledger, and their net
            still counts toward settlement.
          </Text>

          {removable.length === 0 ? (
            <Text testID="nobody-to-remove" style={{ color: '#9fb0a8', fontSize: 15 }}>
              Nobody to remove — you're the only one at this table.
            </Text>
          ) : (
            <ScrollView style={{ maxHeight: 240 }}>
              <View style={{ gap: 8 }}>
                {removable.map((m) => (
                  <Pressable
                    key={m.user_id}
                    testID={`remove-candidate-${m.user_id}`}
                    onPress={() => setChosen(m.user_id)}
                    style={{
                      minHeight: 48,
                      borderRadius: 12,
                      paddingHorizontal: 14,
                      justifyContent: 'center',
                      backgroundColor: chosen === m.user_id ? '#9f1239' : '#1a2620',
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

          {/* The two ways this bites later, named now rather than at settle. */}
          {chosen && (holdsChips || hasPending) && (
            <Text testID="remove-consequence" style={{ color: '#fbbf24', fontSize: 13 }}>
              {hasPending
                ? 'They have an entry still waiting on you. Removing them doesn’t resolve it, and the game won’t close until you do.'
                : 'They haven’t cashed out, so they’ll be marked as having left unsettled until that’s logged.'}
            </Text>
          )}

          {error && (
            <Text testID="remove-error" style={{ color: '#fb7185' }}>
              {error}
            </Text>
          )}

          {removable.length > 0 && (
            <Pressable
              testID="remove-confirm"
              onPress={() => chosen && !pending && onRemove(chosen)}
              disabled={!chosen || pending}
              style={{
                height: 56,
                borderRadius: 14,
                backgroundColor: '#9f1239',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: !chosen || pending ? 0.5 : 1,
              }}
            >
              <Text style={{ color: '#fff', fontSize: 17, fontWeight: '800' }}>
                {pending ? 'Removing…' : chosenName ? `Remove ${chosenName}` : 'Choose a player'}
              </Text>
            </Pressable>
          )}

          <Pressable
            testID="remove-cancel"
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
