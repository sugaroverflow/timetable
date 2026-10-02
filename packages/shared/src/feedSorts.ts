/**
 * The canonical feed-sort list — the ONE authority the core comparators,
 * the API's sort validation, and the web's sort normalizer all derive
 * from (housekeeping 2026-08-13: three hand-kept copies had already
 * diverged). "hearts" is a backward-compatible alias for "l1" (the
 * original weighted score); the web rewrites it before sending, the API
 * keeps accepting it.
 */
export const FEED_SORTS = [
  "hearts",
  "raw",
  "l2",
  "l1",
  "devotion",
  "comments",
  "created",
  "recent",
  "random",
] as const;

export type FeedSort = (typeof FEED_SORTS)[number];

const FEED_SORT_SET: ReadonlySet<string> = new Set(FEED_SORTS);

export function isFeedSort(value: string): value is FeedSort {
  return FEED_SORT_SET.has(value);
}
