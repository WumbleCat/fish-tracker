/** One pending entry at a time, big: who / what / how much / how long ago.
 * Verify and Reject are two large, clearly separated targets. The
 * separation is a hard layout constant asserted by tests — a mis-tap at a
 * dim table must not be able to verify. No swipe gestures, no bulk path. */

import { formatDistanceToNow } from 'date-fns';
import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { fmtMinor } from '../lib/money';
import type { Entry } from '../lib/types';

/** Minimum vertical clear space between Reject and Verify, in dp. Tests
 * assert this stays ≥ 96 — two thumb-widths, not a style preference. */
export const VERIFY_REJECT_SEPARATION = 120;

/** Minimum tap-target height (dp); the primary action is much larger. */
export const MIN_TARGET = 44;
export const VERIFY_TARGET_HEIGHT = 72;

export function VerifyCard({
  entry,
  playerName,
  currency,
  exponent,
  disabled,
  disabledReason,
  onVerify,
  onReject,
}: {
  entry: Entry;
  playerName: string;
  currency: string;
  exponent: number;
  disabled?: boolean;
  disabledReason?: string;
  onVerify: (entry: Entry) => void;
  onReject: (entry: Entry, note: string | null) => void;
}) {
  const [note, setNote] = useState('');
  const [showNote, setShowNote] = useState(false);

  return (
    <View testID="verify-card" style={{ flex: 1, padding: 20 }}>
      <View style={{ alignItems: 'center', gap: 8 }}>
        <Text style={{ color: '#9fb0a8', fontSize: 14 }}>
          {formatDistanceToNow(new Date(entry.created_at), { addSuffix: true })}
        </Text>
        <Text style={{ color: '#e7ece9', fontSize: 28, fontWeight: '700' }}>{playerName}</Text>
        <Text style={{ color: '#9fb0a8', fontSize: 18 }}>
          {entry.entry_type.replace('_', '-')}
          {entry.amends_entry_id ? ' · amends a rejected entry' : ''}
        </Text>
        <Text
          style={{
            color: '#e7ece9',
            fontSize: 44,
            fontWeight: '800',
            fontVariant: ['tabular-nums'],
          }}
        >
          {fmtMinor(entry.amount_minor, currency, exponent)}
        </Text>
      </View>

      {/* Reject: smaller, bordered, at the TOP of the action area */}
      <View style={{ marginTop: 24 }}>
        {showNote ? (
          <View style={{ gap: 8 }}>
            <TextInput
              testID="reject-note"
              value={note}
              onChangeText={setNote}
              placeholder="note, e.g. 'you put in 20, not 40' (optional)"
              placeholderTextColor="#5d6f66"
              style={{
                backgroundColor: '#1a2620',
                color: '#e7ece9',
                borderRadius: 10,
                padding: 12,
                minHeight: MIN_TARGET,
              }}
            />
            <Pressable
              testID="reject-confirm"
              disabled={disabled}
              onPress={() => onReject(entry, note.trim() || null)}
              style={{
                minHeight: MIN_TARGET,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: '#fb7185',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ color: '#fb7185', fontSize: 16, fontWeight: '600' }}>
                Reject{note.trim() ? ' with note' : ''}
              </Text>
            </Pressable>
          </View>
        ) : (
          <Pressable
            testID="reject-button"
            disabled={disabled}
            onPress={() => setShowNote(true)}
            style={{
              minHeight: MIN_TARGET,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: '#fb7185',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: disabled ? 0.4 : 1,
            }}
          >
            <Text style={{ color: '#fb7185', fontSize: 16, fontWeight: '600' }}>Reject…</Text>
          </Pressable>
        )}
      </View>

      {/* The hard gap. Nothing is allowed to render inside it. */}
      <View testID="separation-zone" style={{ height: VERIFY_REJECT_SEPARATION }} />

      {/* Verify: the big, unmistakable target at the bottom */}
      <Pressable
        testID="verify-button"
        disabled={disabled}
        onPress={() => onVerify(entry)}
        style={{
          height: VERIFY_TARGET_HEIGHT,
          borderRadius: 14,
          backgroundColor: disabled ? '#24332c' : '#059669',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ color: '#ffffff', fontSize: 20, fontWeight: '800' }}>Verify</Text>
      </Pressable>
      {disabled && disabledReason && (
        <Text style={{ color: '#9fb0a8', textAlign: 'center', marginTop: 8 }}>
          {disabledReason}
        </Text>
      )}
    </View>
  );
}
