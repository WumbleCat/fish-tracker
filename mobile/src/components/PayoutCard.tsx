/** Bank details on the settle screen: masked by default, explicit reveal,
 * per-field copy plus copy-all — copying is the point; someone is switching
 * to their banking app. Full values come from the RLS-scoped direct read;
 * the API only ever returns the mask. Nothing here is logged. */

import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { Text } from './Text';

import { supabase } from '../lib/supabase';
import type { PayoutDetailsMasked } from '../lib/types';

async function fetchFullAccountNumber(userId: string): Promise<string | null> {
  const { data } = await supabase
    .from('payout_details')
    .select('account_number')
    .eq('user_id', userId)
    .maybeSingle();
  return (data as { account_number: string | null } | null)?.account_number ?? null;
}

function Row({
  label,
  value,
  copyValue,
}: {
  label: string;
  value: string;
  copyValue: () => Promise<string | null>;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 44, gap: 8 }}>
      <Text style={{ color: '#9fb0a8', width: 110 }}>{label}</Text>
      <Text style={{ color: '#e7ece9', fontVariant: ['tabular-nums'] }}>{value}</Text>
      <View style={{ flex: 1 }} />
      <Pressable
        accessibilityLabel={`copy ${label}`}
        onPress={async () => {
          const v = await copyValue();
          if (v) {
            await Clipboard.setStringAsync(v);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }
        }}
        style={{ minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' }}
      >
        <Text style={{ color: copied ? '#34d399' : '#9fb0a8' }}>{copied ? '✓' : 'copy'}</Text>
      </Pressable>
    </View>
  );
}

export function PayoutCard({
  details,
  isGbp,
  title,
}: {
  details: PayoutDetailsMasked;
  isGbp: boolean;
  title?: string;
}) {
  const [revealed, setRevealed] = useState<string | null>(null);
  const hasBankFields = isGbp && (details.sort_code || details.account_number_masked);
  const revolutHref = details.revolut_link
    ? details.revolut_link.startsWith('https://')
      ? details.revolut_link
      : `https://${details.revolut_link}`
    : null;
  if (!hasBankFields && !details.payment_reference && !revolutHref) return null;

  return (
    <View
      testID="payout-card"
      style={{ backgroundColor: '#1a2620', borderRadius: 12, padding: 12, gap: 4 }}
    >
      {title && <Text style={{ color: '#9fb0a8', fontSize: 12 }}>{title.toUpperCase()}</Text>}
      {details.account_name && (
        <Text style={{ color: '#e7ece9', fontWeight: '600' }}>{details.account_name}</Text>
      )}
      {hasBankFields ? (
        <>
          {details.sort_code && (
            <Row
              label="Sort code"
              value={details.sort_code.replace(/(\d{2})(\d{2})(\d{2})/, '$1-$2-$3')}
              copyValue={async () => details.sort_code}
            />
          )}
          {details.account_number_masked && (
            <>
              <Row
                label="Account no."
                value={revealed ?? details.account_number_masked}
                copyValue={() => fetchFullAccountNumber(details.user_id)}
              />
              <Pressable
                accessibilityLabel={revealed ? 'hide account number' : 'reveal account number'}
                onPress={async () =>
                  setRevealed(revealed ? null : await fetchFullAccountNumber(details.user_id))
                }
                style={{ minHeight: 44, justifyContent: 'center' }}
              >
                <Text style={{ color: '#5d6f66', fontSize: 12 }}>
                  {revealed ? 'hide' : 'reveal'}
                </Text>
              </Pressable>
            </>
          )}
          <Pressable
            accessibilityLabel="copy all payout details"
            onPress={async () => {
              const full = await fetchFullAccountNumber(details.user_id);
              const parts = [
                details.account_name,
                details.sort_code,
                full ?? undefined,
              ].filter(Boolean);
              if (parts.length) await Clipboard.setStringAsync(parts.join(' · '));
            }}
            style={{ minHeight: 44, justifyContent: 'center' }}
          >
            <Text style={{ color: '#34d399' }}>Copy all</Text>
          </Pressable>
        </>
      ) : (
        details.payment_reference && (
          <Row
            label="Pay via"
            value={details.payment_reference}
            copyValue={async () => details.payment_reference}
          />
        )
      )}
      {revolutHref && (
        <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 44, gap: 8 }}>
          <Text style={{ color: '#9fb0a8', width: 110 }}>Revolut</Text>
          <Pressable
            testID="revolut-link"
            accessibilityRole="link"
            onPress={() => void Linking.openURL(revolutHref)}
            style={{ minHeight: 44, justifyContent: 'center', flexShrink: 1 }}
          >
            <Text
              numberOfLines={1}
              style={{ color: '#34d399', textDecorationLine: 'underline' }}
            >
              {revolutHref.replace('https://', '')}
            </Text>
          </Pressable>
          <View style={{ flex: 1 }} />
          <Pressable
            accessibilityLabel="copy revolut link"
            onPress={async () => {
              await Clipboard.setStringAsync(revolutHref);
            }}
            style={{ minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ color: '#9fb0a8' }}>copy</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}
