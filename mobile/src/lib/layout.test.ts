import {
  CODE_LENGTH,
  MAX_CONTENT_WIDTH,
  MIN_TAP_TARGET,
  codeRowWidth,
  frontDoorMetrics,
} from './layout';

/** Real handsets, in points, not a tidy sample. The narrow end is where the
 * chip row overflows; the wide end is where it stops looking like a phone. */
const DEVICES: [string, number, number][] = [
  ['iPhone SE (1st gen)', 320, 568],
  ['iPhone SE (2nd/3rd gen)', 375, 667],
  ['iPhone 13 mini', 375, 812],
  ['iPhone 15', 393, 852],
  ['iPhone 15 Pro Max', 430, 932],
  ['Pixel 4a', 393, 851],
  ['Pixel 8 Pro', 412, 892],
  ['Galaxy S8 (narrow)', 360, 740],
  ['Galaxy Z Fold, folded', 344, 882],
  ['Galaxy Z Fold, unfolded', 673, 841],
  ['iPad mini portrait', 744, 1133],
];

describe('frontDoorMetrics', () => {
  it.each(DEVICES)('fits the six chips across %s', (_name, width, height) => {
    const m = frontDoorMetrics(width, height);
    expect(codeRowWidth(m)).toBeLessThanOrEqual(m.contentWidth);
    expect(m.contentWidth).toBeLessThanOrEqual(width - m.pad * 2);
  });

  it.each(DEVICES)('keeps a chip legible on %s', (_name, width, height) => {
    const m = frontDoorMetrics(width, height);
    // A tile below ~30pt cannot hold a character someone reads across a room.
    expect(m.tile).toBeGreaterThanOrEqual(30);
    expect(m.codeFont).toBeGreaterThanOrEqual(14);
    expect(m.codeFont).toBeLessThan(m.tile);
  });

  it.each(DEVICES)('keeps the primary action tappable on %s', (_name, width, height) => {
    const m = frontDoorMetrics(width, height);
    expect(m.buttonHeight).toBeGreaterThanOrEqual(MIN_TAP_TARGET);
  });

  it('stops the column growing on a tablet or an unfolded Fold', () => {
    const folded = frontDoorMetrics(344, 882);
    const unfolded = frontDoorMetrics(673, 841);
    const tablet = frontDoorMetrics(744, 1133);

    expect(unfolded.contentWidth).toBe(MAX_CONTENT_WIDTH);
    expect(tablet.contentWidth).toBe(MAX_CONTENT_WIDTH);
    // and the chips settle rather than ballooning
    expect(tablet.tile).toBeLessThanOrEqual(64);
    expect(unfolded.tile).toBeGreaterThan(folded.tile);
  });

  it('tightens the vertical rhythm on a short screen', () => {
    const short = frontDoorMetrics(320, 568);
    const tall = frontDoorMetrics(430, 932);
    expect(short.gap).toBeLessThan(tall.gap);
  });

  it('grows the chip with the screen instead of pinning one size', () => {
    const se = frontDoorMetrics(320, 568);
    const proMax = frontDoorMetrics(430, 932);
    expect(proMax.tile).toBeGreaterThan(se.tile);
    expect(proMax.codeFont).toBeGreaterThan(se.codeFont);
  });

  it('never lets padding eat a narrow screen', () => {
    const m = frontDoorMetrics(320, 568);
    expect(m.pad).toBeGreaterThanOrEqual(16);
    expect(m.pad).toBeLessThanOrEqual(32);
    expect(m.contentWidth).toBeGreaterThan(width320Minimum());
  });
});

/** The narrowest column we are willing to render six chips into. */
function width320Minimum() {
  return CODE_LENGTH * 30 + 5 * 5 - 1;
}
