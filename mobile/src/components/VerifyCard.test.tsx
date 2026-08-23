/** Verify and reject must be far enough apart that a mis-tap can't verify.
 * The layout itself is asserted — the separation zone, target sizes and
 * ordering — not just that two handlers exist. */

import { fireEvent, render, screen } from '@testing-library/react-native';

import type { Entry } from '../lib/types';
import {
  MIN_TARGET,
  VERIFY_REJECT_SEPARATION,
  VERIFY_TARGET_HEIGHT,
  VerifyCard,
} from './VerifyCard';

const entry: Entry = {
  id: 'e1',
  game_id: 'g1',
  user_id: 'u1',
  entry_type: 'buy_in',
  amount_minor: 4000,
  state: 'pending',
  created_at: new Date().toISOString(),
  logged_by: 'u1',
  verified_by: null,
  verified_at: null,
  rejection_note: null,
  void_reason: null,
  amends_entry_id: null,
  version: 1,
};

async function renderCard(overrides: Partial<Parameters<typeof VerifyCard>[0]> = {}) {
  const onVerify = jest.fn();
  const onReject = jest.fn();
  const view = await render(
    <VerifyCard
      entry={entry}
      playerName="Charlie"
      currency="GBP"
      exponent={2}
      onVerify={onVerify}
      onReject={onReject}
      {...overrides}
    />,
  );
  return { ...view, onVerify, onReject };
}

const flatten = (style: unknown): Record<string, unknown> =>
  Array.isArray(style) ? Object.assign({}, ...(style as object[])) : ((style ?? {}) as Record<string, unknown>);

describe('VerifyCard layout', () => {
  it('keeps a hard separation zone of at least 96dp between reject and verify', async () => {
    await renderCard();
    const zone = flatten(screen.getByTestId('separation-zone').props.style);
    expect(VERIFY_REJECT_SEPARATION).toBeGreaterThanOrEqual(96);
    expect(zone.height).toBe(VERIFY_REJECT_SEPARATION);
  });

  it('renders reject ABOVE the separation zone and verify BELOW it', async () => {
    const view = await renderCard();
    // document order in the rendered tree: reject, then the hard gap, then verify
    const serialized = JSON.stringify(view.toJSON());
    const rejectAt = serialized.indexOf('reject-button');
    const zoneAt = serialized.indexOf('separation-zone');
    const verifyAt = serialized.indexOf('verify-button');
    expect(rejectAt).toBeGreaterThan(-1);
    expect(zoneAt).toBeGreaterThan(rejectAt);
    expect(verifyAt).toBeGreaterThan(zoneAt);
  });

  it('both targets meet the minimum size, and verify is much larger', async () => {
    await renderCard();
    const reject = flatten(screen.getByTestId('reject-button').props.style);
    const verify = flatten(screen.getByTestId('verify-button').props.style);
    expect(reject.minHeight as number).toBeGreaterThanOrEqual(MIN_TARGET);
    expect(verify.height as number).toBeGreaterThanOrEqual(VERIFY_TARGET_HEIGHT);
    expect(verify.height as number).toBeGreaterThan(reject.minHeight as number);
  });

  it('verify fires only from its own target; reject opens the note first', async () => {
    const { onVerify, onReject } = await renderCard();
    await fireEvent.press(screen.getByTestId('reject-button'));
    expect(onVerify).not.toHaveBeenCalled();
    expect(onReject).not.toHaveBeenCalled(); // note sheet first, one tap to skip
    await fireEvent.press(screen.getByTestId('reject-confirm'));
    expect(onReject).toHaveBeenCalledWith(entry, null);
    expect(onVerify).not.toHaveBeenCalled();
  });

  it('verify passes the entry through', async () => {
    const { onVerify } = await renderCard();
    await fireEvent.press(screen.getByTestId('verify-button'));
    expect(onVerify).toHaveBeenCalledWith(entry);
  });

  it('offline disables both actions', async () => {
    const { onVerify } = await renderCard({ disabled: true, disabledReason: 'offline' });
    await fireEvent.press(screen.getByTestId('verify-button'));
    expect(onVerify).not.toHaveBeenCalled();
  });
});
