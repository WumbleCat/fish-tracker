/** Reconciliation banner first; payments only after acknowledgement.
 * The share sheet exports names and amounts — bank details never enter the
 * summary string, by construction. */

import { useState } from 'react';
import { Pressable, Share, View } from 'react-native';
import { Text } from './Text';

import { fmtMinor } from '../lib/money';
import type { Game, PayoutDetailsMasked, Settlement } from '../lib/types';
import { AmountText } from './AmountText';
import { PayoutCard } from './PayoutCard';

export function buildShareSummary(
  gameName: string,
  settlement: Settlement,
  nameOf: (id: string) => string,
  currency: string,
  exponent: number,
): string {
  const lines = [
    `${gameName} — settlement`,
    ...settlement.payments.map(
      (p) =>
        `${nameOf(p.from_user)} → ${nameOf(p.to_user)}: ${fmtMinor(p.amount_minor, currency, exponent)}`,
    ),
  ];
  if (settlement.payments.length === 0) lines.push('All square — no payments needed.');
  if (settlement.final && settlement.discrepancy_minor !== 0) {
    lines.push(
      `Note: closed ${fmtMinor(Math.abs(settlement.discrepancy_minor), currency, exponent)} ` +
        `${settlement.discrepancy_minor > 0 ? 'short' : 'over'} (acknowledged).`,
    );
  }
  return lines.join('\n');
}

export function SettleView({
  game,
  settlement,
  /** null for guests: the API refuses them and nothing renders. */
  payoutDetails,
  isHost,
  stale,
  onClose,
}: {
  game: Game;
  settlement: Settlement;
  payoutDetails: PayoutDetailsMasked[] | null;
  isHost: boolean;
  /** true when this data couldn't be freshly fetched — blocks rendering. */
  stale?: boolean;
  onClose?: (acknowledge: boolean) => void;
}) {
  const [acknowledged, setAcknowledged] = useState(false);
  const { currency, currency_exponent: exponent } = game;
  const nameOf = (id: string) =>
    game.members.find((m) => m.user_id === id)?.display_name ?? 'unknown';

  if (stale) {
    return (
      <Text style={{ color: '#fbbf24', padding: 16 }}>
        Can't refresh the settlement right now — these numbers may be stale, so they aren't
        shown. Reconnect and try again.
      </Text>
    );
  }

  const mismatch = settlement.discrepancy_minor !== 0;
  const gated = mismatch && !settlement.final && !acknowledged;
  const detailFor = (id: string) => payoutDetails?.find((d) => d.user_id === id) ?? null;
  const hostDetails = detailFor(game.host_id);
  // The counter: identical rows in every state, no prose. GAP is the
  // reconciliation surface — amber and gating when nonzero, ✓ when not.
  const buyIns = game.totals.verified_buy_ins_minor;
  const cashOuts = game.totals.verified_cash_outs_minor;

  const rowStyle = {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingHorizontal: 14,
    paddingVertical: 12,
  };
  const labelStyle = { color: '#9fb0a8', fontSize: 12, letterSpacing: 1 };

  return (
    <View style={{ gap: 12 }}>
      <View style={{ backgroundColor: '#111a16', borderRadius: 12, overflow: 'hidden' }}>
        <View style={rowStyle}>
          <Text style={labelStyle}>BUY-INS</Text>
          <Text style={{ color: '#e7ece9', fontWeight: '600', fontVariant: ['tabular-nums'] }}>
            {fmtMinor(buyIns, currency, exponent)}
          </Text>
        </View>
        <View style={rowStyle}>
          <Text style={labelStyle}>CASH-OUTS</Text>
          <Text style={{ color: '#e7ece9', fontWeight: '600', fontVariant: ['tabular-nums'] }}>
            {fmtMinor(cashOuts, currency, exponent)}
          </Text>
        </View>
        <View
          testID={mismatch ? 'recon-banner' : 'gap-balanced'}
          style={[rowStyle, mismatch ? { backgroundColor: 'rgba(251,191,36,0.14)' } : null]}
        >
          <Text style={[labelStyle, mismatch ? { color: '#fbbf24', fontWeight: '700' } : null]}>
            GAP
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {mismatch ? (
              <>
                <Text style={{ color: '#fbbf24', fontWeight: '700', fontVariant: ['tabular-nums'] }}>
                  {fmtMinor(Math.abs(settlement.discrepancy_minor), currency, exponent)}
                </Text>
                <Text
                  style={{
                    color: '#0b1210',
                    backgroundColor: '#fbbf24',
                    fontWeight: '800',
                    fontSize: 11,
                    paddingHorizontal: 8,
                    paddingVertical: 2,
                    borderRadius: 10,
                    overflow: 'hidden',
                  }}
                >
                  {settlement.discrepancy_minor > 0 ? 'SHORT' : 'OVER'}
                </Text>
              </>
            ) : (
              <Text style={{ color: '#34d399', fontWeight: '700', fontVariant: ['tabular-nums'] }}>
                {fmtMinor(0, currency, exponent)} ✓
              </Text>
            )}
          </View>
        </View>
        {settlement.pending_count > 0 && (
          <View style={[rowStyle, { backgroundColor: 'rgba(251,191,36,0.14)' }]}>
            <Text style={[labelStyle, { color: '#fbbf24', fontWeight: '700' }]}>PENDING</Text>
            <Text style={{ color: '#fbbf24', fontWeight: '700', fontVariant: ['tabular-nums'] }}>
              {settlement.pending_count}
            </Text>
          </View>
        )}
      </View>

      {mismatch && !settlement.final && (
        <Pressable
          testID="acknowledge-toggle"
          onPress={() => setAcknowledged((a) => !a)}
          style={{ minHeight: 44, justifyContent: 'center' }}
        >
          <Text style={{ color: acknowledged ? '#34d399' : '#9fb0a8' }}>
            {acknowledged ? '☑' : '☐'} settle with gap on record
          </Text>
        </Pressable>
      )}
      {mismatch && settlement.final && settlement.acknowledged_by && (
        <Text style={{ color: '#9fb0a8', fontSize: 12 }}>gap on record</Text>
      )}

      {gated ? (
        <Text testID="payments-gated" style={{ color: '#9fb0a8' }}>
          🔒 payments
        </Text>
      ) : (
        <View testID="payments-list" style={{ gap: 8 }}>
          {settlement.payments.length === 0 && (
            <Text style={{ color: '#9fb0a8' }}>All square — no payments needed.</Text>
          )}
          {settlement.payments.map((p, i) => {
            const payee = detailFor(p.to_user);
            return (
              <View
                key={i}
                style={{ backgroundColor: '#111a16', borderRadius: 12, padding: 12, gap: 8 }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  {p.paid && (
                    <Text
                      testID="paid-pill"
                      style={{
                        color: '#06231a',
                        backgroundColor: '#34d399',
                        fontSize: 11,
                        fontWeight: '800',
                        paddingHorizontal: 6,
                        paddingVertical: 2,
                        borderRadius: 99,
                      }}
                    >
                      PAID
                    </Text>
                  )}
                  <Text style={{ color: p.paid ? '#9fb0a8' : '#e7ece9', fontWeight: '600' }}>
                    {nameOf(p.from_user)}
                  </Text>
                  <Text style={{ color: '#5d6f66' }}>→</Text>
                  <Text style={{ color: '#e7ece9', fontWeight: '600' }}>{nameOf(p.to_user)}</Text>
                  <View style={{ flex: 1 }} />
                  <AmountText minor={p.amount_minor} currency={currency} exponent={exponent} bold />
                </View>
                {payee && !p.paid && <PayoutCard details={payee} isGbp={currency === 'GBP'} />}
              </View>
            );
          })}

          <Pressable
            testID="share-summary"
            onPress={() =>
              void Share.share({
                message: buildShareSummary(game.name, settlement, nameOf, currency, exponent),
              })
            }
            style={{ minHeight: 44, justifyContent: 'center' }}
          >
            <Text style={{ color: '#9fb0a8', textDecorationLine: 'underline' }}>
              Share summary (names and amounts only)
            </Text>
          </Pressable>
        </View>
      )}

      {hostDetails && !gated && (
        <PayoutCard details={hostDetails} isGbp={currency === 'GBP'} title="Pay the host" />
      )}

      {isHost && !settlement.final && game.state === 'settling' && (
        <Pressable
          testID="close-game"
          disabled={settlement.pending_count > 0 || gated}
          onPress={() => onClose?.(mismatch && acknowledged)}
          style={{
            height: 56,
            borderRadius: 14,
            backgroundColor: settlement.pending_count > 0 || gated ? '#24332c' : '#e7ece9',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ color: '#0b1210', fontSize: 16, fontWeight: '800' }}>
            Close game & record settlement
          </Text>
        </Pressable>
      )}
    </View>
  );
}
