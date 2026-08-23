/** Jest + jest-expo + RNTL. Tests cover the mobile-design list: money,
 * pending-vs-net, the offline queue, verify/reject separation, guest
 * absence, and the reconciliation gate. */
module.exports = {
  preset: 'jest-expo',
  setupFiles: ['./src/test/setup.ts'],
  transformIgnorePatterns: [
    // jest-expo's default, extended with the extra RN-flavoured packages here
    '/node_modules/(?!(.pnpm|react-native|@react-native|@react-native-community|expo|@expo|@expo-google-fonts|react-navigation|@react-navigation|@sentry/react-native|native-base|standard-navigation|nativewind|react-native-css-interop|@gorhom|react-native-url-polyfill))',
    '/node_modules/react-native-reanimated/plugin/',
    '/node_modules/@react-native/babel-preset/',
  ],
  testMatch: ['**/*.test.ts', '**/*.test.tsx'],
};
