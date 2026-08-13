import type { FeedComment } from "@/lib/feedTypes";

/** Total comments in the trees, all levels. */
export function countNested(comments: FeedComment[]): number {
  return comments.reduce((sum, c) => sum + 1 + countNested(c.replies ?? []), 0);
}

/** True when `id` names a comment anywhere in the trees — drives the
 * teaser's ?reply= deep-link auto-open. */
export function treeContains(
  comments: FeedComment[],
  id: string | null,
): boolean {
  if (!id) return false;
  return comments.some((c) => c.id === id || treeContains(c.replies ?? [], id));
}
