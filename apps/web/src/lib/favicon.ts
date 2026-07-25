/** Emoji → SVG data-URI favicon, so no icon asset/route is needed. Used for
 * the app default (📚) and for forums with an icon emoji; forums with an
 * uploaded icon link its URL directly. */
export function emojiFavicon(emoji: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">${emoji}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
