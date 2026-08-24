/** Font files to load at boot, by family name. Aperçu is licensed and not in
 * the repository (see assets/fonts/README.md); once the file is in place,
 * uncomment the line. Metro resolves require() at bundle time, so a
 * dangling require would fail the build — hence the comment, not a guard. */

export const fontSources: Record<string, number> = {
  // 'Apercu-Medium': require('../../assets/fonts/Apercu-Medium.otf'),
};
