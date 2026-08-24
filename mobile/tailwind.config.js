/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      // The house face, loaded by lib/fonts.ts and applied through
      // components/Text. An unloaded family falls back to the platform
      // default, so the app still renders before the licensed file is added.
      fontFamily: {
        sans: ['Apercu-Medium'],
      },
      // Dark is the default worth designing for: this app is used at night.
      colors: {
        felt: {
          950: '#0b1210',
          900: '#111a16',
          800: '#1a2620',
          700: '#24332c',
        },
        chip: {
          up: '#34d399',
          down: '#fb7185',
          pending: '#fbbf24',
        },
      },
    },
  },
  plugins: [],
};
