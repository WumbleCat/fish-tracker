/** Screen metrics for the first-run screens, derived from the live window
 * rather than fixed to one handset.
 *
 * The front door is used standing up, in a dim room, while someone reads six
 * characters aloud — on whatever phone the player happens to own. That range
 * is wide: a 320pt iPhone SE through a 430pt Pro Max, and a folded Fold at
 * 344pt that becomes 673pt when opened mid-session. Hardcoded sizes either
 * overflow the small end or leave the large end looking like a stretched
 * mockup, so every size here is computed and clamped.
 *
 * Pure functions, no React — the arithmetic is the part worth testing.
 */

export const CODE_LENGTH = 6;

/** Past this the chip row stops growing and centres instead. A tablet or an
 * unfolded Fold gets a front door the size of a phone's, because six chips
 * spread over 600pt read as a keypad, not as a hand of chips. */
export const MAX_CONTENT_WIDTH = 420;

/** The floor the platform guidelines put under anything tappable. */
export const MIN_TAP_TARGET = 44;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export interface FrontDoorMetrics {
  /** Horizontal padding from the screen edge. */
  pad: number;
  /** Width the column actually occupies, centred within the screen. */
  contentWidth: number;
  /** Vertical rhythm between blocks. */
  gap: number;
  /** Edge length of one chip tile — they are round, so width === height. */
  tile: number;
  tileGap: number;
  codeFont: number;
  titleFont: number;
  fieldFont: number;
  fieldPadding: number;
  buttonHeight: number;
  buttonFont: number;
}

export function frontDoorMetrics(width: number, height: number): FrontDoorMetrics {
  const pad = clamp(Math.round(width * 0.065), 16, 32);
  const contentWidth = Math.min(width - pad * 2, MAX_CONTENT_WIDTH);

  // Tiles are sized from the width that is left after the gaps, then capped:
  // beyond ~64pt a chip stops reading as a chip. Whatever the cap leaves over
  // becomes centring space, never stretch.
  const tileGap = clamp(Math.round(contentWidth * 0.022), 5, 10);
  const tile = clamp(
    Math.floor((contentWidth - tileGap * (CODE_LENGTH - 1)) / CODE_LENGTH),
    30,
    64,
  );

  // A short screen is short because the keyboard is up or the phone is old;
  // either way the rhythm tightens before anything gets cut off.
  const gap = clamp(Math.round(height * 0.024), 12, 22);

  return {
    pad,
    contentWidth,
    gap,
    tile,
    tileGap,
    // The character rides the tile: sized as a fraction of it, so a 34pt chip
    // on an SE and a 60pt chip on a Pro Max are both legibly full.
    codeFont: clamp(Math.round(tile * 0.52), 14, 30),
    titleFont: clamp(Math.round(contentWidth * 0.085), 22, 34),
    fieldFont: clamp(Math.round(contentWidth * 0.046), 15, 18),
    fieldPadding: clamp(Math.round(contentWidth * 0.045), 12, 18),
    buttonHeight: clamp(Math.round(height * 0.075), MIN_TAP_TARGET + 8, 66),
    buttonFont: clamp(Math.round(contentWidth * 0.048), 15, 19),
  };
}

/** The chip row's own width — the tiles plus the gaps between them. Used to
 * centre the row when the tile cap leaves slack. */
export function codeRowWidth(m: FrontDoorMetrics): number {
  return m.tile * CODE_LENGTH + m.tileGap * (CODE_LENGTH - 1);
}
