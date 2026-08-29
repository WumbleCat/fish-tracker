/** The host logs for a player who isn't using the app (app-logic,
 * 2026-08-28). The row that makes it possible must not be visible to anyone
 * else, and it must not cost the common case a tap: "Me" is already chosen,
 * so open → confirm still logs your own. */

import { fireEvent, render, screen } from '@testing-library/react-native';

import { EntrySheetContent } from './EntrySheetContent';

const seatFor = [
  { userId: 'u-dave', name: 'Dave' },
  { userId: 'u-sam', name: 'Sam' },
];

const show = async (props: Partial<React.ComponentProps<typeof EntrySheetContent>> = {}) => {
  const onSubmit = jest.fn();
  // RNTL renders and fires concurrently: every render and press is awaited,
  // or the next query reads a tree React has not finished updating
  await render(
    <EntrySheetContent
      currency="GBP"
      exponent={2}
      stakeMinor={2000}
      lastAmountMinor={null}
      onSubmit={onSubmit}
      {...props}
    />,
  );
  return onSubmit;
};

describe('logging for someone else', () => {
  it('offers nobody to log for when the sheet is a player’s own', async () => {
    await show();
    expect(screen.queryByTestId('for-me')).toBeNull();
    expect(screen.queryByTestId('for-u-dave')).toBeNull();
  });

  it('still logs your own entry in two taps with the picker present', async () => {
    const onSubmit = await show({ seatFor });

    await fireEvent.press(screen.getByTestId('entry-confirm'));

    // the stake was pre-filled and "Me" was already selected
    expect(onSubmit).toHaveBeenCalledWith('rebuy', 2000, null);
  });

  it('logs the entry against the player the host picked', async () => {
    const onSubmit = await show({ seatFor });

    await fireEvent.press(screen.getByTestId('for-u-dave'));
    await fireEvent.press(screen.getByTestId('entry-confirm'));

    expect(onSubmit).toHaveBeenCalledWith('rebuy', 2000, 'u-dave');
  });

  it('says whose entry it is on the button — this is not your own money', async () => {
    await show({ seatFor });

    await fireEvent.press(screen.getByTestId('for-u-sam'));

    expect(screen.getByText(/Log rebuy for Sam/)).toBeTruthy();
  });

  it('opens on the player it was told to, for the one just seated', async () => {
    const onSubmit = await show({ seatFor, defaultTargetUserId: 'u-dave' });

    await fireEvent.press(screen.getByTestId('entry-confirm'));

    expect(onSubmit).toHaveBeenCalledWith('rebuy', 2000, 'u-dave');
  });

  it('keeps the cash-out unfilled, whoever it is for', async () => {
    const onSubmit = await show({ seatFor, defaultType: 'cash_out' });

    await fireEvent.press(screen.getByTestId('for-u-dave'));
    await fireEvent.press(screen.getByTestId('entry-confirm'));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByTestId('entry-error')).toBeTruthy();
  });
});

/** Chips on and chips off must not look interchangeable. The sheet is where
 * the amount is typed, so a person who reached for a rebuy and is about to
 * log a cash-out has one last chance to notice. */
describe('telling the two directions apart', () => {
  const flat = (style: unknown) =>
    (Array.isArray(style) ? Object.assign({}, ...style) : style) as Record<string, unknown>;

  it('does not give cash-out the same selected colour as a buy-in', async () => {
    await show({ defaultType: 'buy_in' });
    const buyInTone = flat(screen.getByTestId('type-buy_in').props.style).backgroundColor;

    await fireEvent.press(screen.getByTestId('type-cash_out'));
    const cashOutTone = flat(screen.getByTestId('type-cash_out').props.style).backgroundColor;

    expect(cashOutTone).not.toBe(buyInTone);
  });

  it('sets the cash-out control apart from the buy-in pair by more than colour', async () => {
    await show();

    const buyIn = flat(screen.getByTestId('type-buy_in').props.style);
    const cashOut = flat(screen.getByTestId('type-cash_out').props.style);

    expect(cashOut.marginLeft).toBeGreaterThan(Number(buyIn.marginLeft ?? 0));
    expect(cashOut.flex).toBeGreaterThan(Number(buyIn.flex));
  });

  it('carries the direction through to the button that actually logs it', async () => {
    await show({ defaultType: 'rebuy' });
    const rebuyConfirm = flat(screen.getByTestId('entry-confirm').props.style).backgroundColor;

    await fireEvent.press(screen.getByTestId('type-cash_out'));
    const cashOutConfirm = flat(screen.getByTestId('entry-confirm').props.style).backgroundColor;

    expect(cashOutConfirm).not.toBe(rebuyConfirm);
    expect(screen.getByText(/Log cash-out/)).toBeTruthy();
  });

  it('still refuses to pre-fill a cash-out, however obvious the button is', async () => {
    const onSubmit = await show({ defaultType: 'rebuy' });

    await fireEvent.press(screen.getByTestId('type-cash_out'));
    await fireEvent.press(screen.getByTestId('entry-confirm'));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByTestId('entry-error')).toBeTruthy();
  });
});
