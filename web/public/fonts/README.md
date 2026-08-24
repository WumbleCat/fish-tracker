# Fonts

The web app is set in **Aperçu Medium** (Colophon Foundry). It is a licensed
typeface, so the font files are deliberately not committed to this public
repository — `.gitignore` excludes every font file in this folder.

To enable it, put the licensed web files here:

```
web/public/fonts/apercu-medium.woff2
web/public/fonts/apercu-medium.woff     (optional fallback)
```

`src/index.css` already declares the `@font-face` and uses it as the
`font-sans` stack; nothing else needs changing. Until the files are present
the UI renders in the system face at the same weight.

Deploying: the frontend builds from git on Vercel, so a gitignored file
never reaches production. Either make the repository private and commit the
files (allowed by a standard web font licence for your own domain), or host
them on a URL you control and point the `src:` in `index.css` at it.
