/** The app-wide Text: React Native's, set in the house face. Every screen
 * imports Text from here rather than from react-native, so the font is one
 * decision in tailwind.config.js (font-sans → Aperçu Medium) instead of a
 * className on every label. A component's own font class still wins. */

import { Text as RNText, type TextProps } from 'react-native';

export type { TextProps };

export function Text({ className, ...props }: TextProps & { className?: string }) {
  return <RNText className={className ? `font-sans ${className}` : 'font-sans'} {...props} />;
}
