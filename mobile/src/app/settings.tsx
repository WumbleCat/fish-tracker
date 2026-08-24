/** Display name, default currency (new games + history display only —
 * never an existing ledger), payout details, notifications. */

import { useQueryClient } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import { Text } from '../components/Text';

import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { registerForPush } from '../lib/notifications';
import { useMe } from '../lib/queries';

const CURRENCIES = ['GBP', 'EUR', 'USD', 'JPY', 'AUD', 'CAD'];

const field = {
  backgroundColor: '#1a2620',
  color: '#e7ece9',
  fontSize: 16,
  borderRadius: 12,
  padding: 14,
} as const;

export default function Settings() {
  const queryClient = useQueryClient();
  const { status, signOut } = useAuth();
  const isGuest = status === 'guest';
  const { data: me } = useMe(!isGuest);
  const [displayName, setDisplayName] = useState('');
  const [accountName, setAccountName] = useState('');
  const [sortCode, setSortCode] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [paymentReference, setPaymentReference] = useState('');
  const [revolutLink, setRevolutLink] = useState('');
  const [pushState, setPushState] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (me) setDisplayName(me.display_name);
  }, [me]);

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
      <Stack.Screen options={{ title: 'Settings' }} />

      <Text style={{ color: '#9fb0a8', fontSize: 12 }}>DISPLAY NAME</Text>
      <TextInput value={displayName} onChangeText={setDisplayName} style={field} />

      {!isGuest && (
        <>
          <Text style={{ color: '#9fb0a8', fontSize: 12 }}>
            DEFAULT CURRENCY — new games and your history display; never an existing ledger
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {CURRENCIES.map((c) => (
              <Pressable
                key={c}
                onPress={async () => {
                  await api.updateMe({ default_currency: c });
                  void queryClient.invalidateQueries({ queryKey: ['me'] });
                }}
                style={{
                  minHeight: 44,
                  paddingHorizontal: 14,
                  borderRadius: 10,
                  backgroundColor: me?.default_currency === c ? '#059669' : '#1a2620',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ color: '#e7ece9' }}>{c}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={{ color: '#9fb0a8', fontSize: 12 }}>
            PAYOUT DETAILS — optional; shown only to people settling a game with you
          </Text>
          <TextInput
            value={accountName}
            onChangeText={setAccountName}
            placeholder="Account name"
            placeholderTextColor="#5d6f66"
            style={field}
          />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput
              value={sortCode}
              onChangeText={(t) => setSortCode(t.replace(/[^0-9]/g, ''))}
              placeholder="Sort code (6 digits)"
              placeholderTextColor="#5d6f66"
              keyboardType="number-pad"
              maxLength={6}
              style={[field, { flex: 1 }]}
            />
            <TextInput
              value={accountNumber}
              onChangeText={(t) => setAccountNumber(t.replace(/[^0-9]/g, ''))}
              placeholder="Account no. (8 digits)"
              placeholderTextColor="#5d6f66"
              keyboardType="number-pad"
              maxLength={8}
              style={[field, { flex: 1 }]}
            />
          </View>
          <TextInput
            value={paymentReference}
            onChangeText={setPaymentReference}
            placeholder="Payment reference for non-GBP games (IBAN, link…)"
            placeholderTextColor="#5d6f66"
            style={field}
          />
          <TextInput
            value={revolutLink}
            onChangeText={(t) => setRevolutLink(t.trim())}
            placeholder="Revolut link — revolut.me/yourname"
            placeholderTextColor="#5d6f66"
            autoCapitalize="none"
            style={field}
          />
        </>
      )}

      <Pressable
        onPress={async () => {
          await api.updateMe({ display_name: displayName });
          if (!isGuest) {
            await api.putPayoutDetails({
              account_name: accountName || null,
              sort_code: /^[0-9]{6}$/.test(sortCode) ? sortCode : null,
              account_number: /^[0-9]{8}$/.test(accountNumber) ? accountNumber : null,
              payment_reference: paymentReference || null,
              revolut_link: /^(https:\/\/)?revolut\.me\/[A-Za-z0-9._-]{2,64}$/.test(revolutLink)
                ? revolutLink
                : null,
            });
          }
          void queryClient.invalidateQueries({ queryKey: ['me'] });
          setSaved(true);
          setTimeout(() => setSaved(false), 1500);
        }}
        style={{
          height: 56,
          borderRadius: 12,
          backgroundColor: '#059669',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ color: '#fff', fontWeight: '700' }}>{saved ? 'Saved ✓' : 'Save'}</Text>
      </Pressable>

      <Pressable
        onPress={async () => {
          const ok = await registerForPush();
          setPushState(
            ok
              ? "Notifications on — you'll hear when an entry needs verifying."
              : 'Notifications unavailable (denied, or running in a simulator).',
          );
        }}
        style={{ minHeight: 44, justifyContent: 'center' }}
      >
        <Text style={{ color: '#34d399' }}>Enable host notifications</Text>
      </Pressable>
      {pushState && <Text style={{ color: '#9fb0a8' }}>{pushState}</Text>}

      <Pressable onPress={() => void signOut()} style={{ minHeight: 44, justifyContent: 'center' }}>
        <Text style={{ color: '#fb7185' }}>Sign out</Text>
      </Pressable>
    </ScrollView>
  );
}
