# Fonts

The app is set in **Aperçu Medium** (Colophon Foundry). It is a licensed
typeface, so the font file is deliberately not committed to this public
repository — `.gitignore` excludes every `.otf`/`.ttf` in this folder.

To enable it:

1. Put the licensed file here as `mobile/assets/fonts/Apercu-Medium.otf`
   (`.ttf` also works — match the extension in step 2).
2. In `src/lib/font-sources.ts`, uncomment the one `require(...)` line.

`src/lib/fonts.ts` loads whatever `font-sources.ts` lists with `expo-font`
before the first screen renders, and the app-wide `Text` component
(`src/components/Text.tsx`) applies the face. Until the file is present the
app renders in the platform default.

Metro resolves `require()` at bundle time, which is why the line stays
commented until the file exists — a dangling require fails the build.
