/** The felt, with the light over the table.
 *
 * The design's front door sits on `radial-gradient(90% 60% at 50% 0%,
 * #183025, #0b1210 60%)` — a lamp above the top edge falling off into dark.
 * React Native has no gradient primitive and the project has no gradient
 * dependency, so the glow is built from concentric ellipses: circles
 * scaled on X, centred on the top edge, each carrying a small slice of the
 * final opacity.
 *
 * Banding is the obvious risk with stacked solids. It doesn't show here
 * because the two ends of this ramp are only ~13/30/21 apart in RGB — split
 * across twelve layers, each step moves a channel by one or two, which is
 * below what a screen resolves. A real gradient would be preferable; this is
 * what the dependency budget allows, and on a dark screen it is
 * indistinguishable.
 */

import { useWindowDimensions, View } from 'react-native';

const BASE = '#0b1210';
const GLOW = '#183025';
const LAYERS = 12;
/** Solved so the layers compound to ~0.85 at the centre: 1 − (1 − a)^12. */
const LAYER_OPACITY = 0.146;

export function FeltBackdrop({ glow = true }: { glow?: boolean }) {
  const { width, height } = useWindowDimensions();

  // The ellipse is sized from the window, so it follows a rotation or an
  // unfolding rather than being cropped from a phone-shaped guess.
  const spanX = width * 0.9;
  const spanY = height * 0.6;

  return (
    <View
      pointerEvents="none"
      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: BASE }}
    >
      {glow &&
        Array.from({ length: LAYERS }, (_, i) => {
          const scale = 1 - i / LAYERS; // outermost and faintest first
          const diameter = spanY * scale;
          return (
            <View
              key={i}
              style={{
                position: 'absolute',
                width: diameter,
                height: diameter,
                borderRadius: diameter / 2,
                left: (width - diameter) / 2,
                top: -diameter / 2, // centre on the top edge, as `at 50% 0%`
                backgroundColor: GLOW,
                opacity: LAYER_OPACITY,
                transform: [{ scaleX: (spanX * scale) / diameter }],
              }}
            />
          );
        })}
    </View>
  );
}
