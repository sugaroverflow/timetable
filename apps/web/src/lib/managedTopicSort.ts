import type { FeedComment, ManagedTopic, TopicStatus } from "./feedTypes";

/** Sort keys for the managed-topic lists (My Topics, Pending Topics). */
export type ManagedSort = "updated" | "comments" | "status" | "title";

export type ManagedSortOption = { value: ManagedSort; label: string };

export const MY_TOPICS_SORTS: ManagedSortOption[] = [
  { value: "updated", label: "Recently updated" },
  { value: "comments", label: "Latest comments" },
  { value: "status", label: "Status" },
  { value: "title", label: "Title A–Z" },
];

export const PENDING_SORTS: ManagedSortOption[] = [
  { value: "updated", label: "Recently updated" },
  { value: "comments", label: "Latest comment" },
  { value: "title", label: "Title A–Z" },
];

export function normalizeManagedSort(
  value: string | undefined,
  options: ManagedSortOption[],
): ManagedSort {
  const match = options.find((o) => o.value === value);
  return match ? match.value : "updated";
}

function latestIn(comments: FeedComment[] | undefined): number {
  let latest = 0;
  for (const c of comments ?? []) {
    latest = Math.max(latest, Date.parse(c.createdAt), latestIn(c.replies));
  }
  return latest;
}

/** Newest comment timestamp across every thread selected for the card.
 * My Topics fetches all three threads; Pending Topics fetches only the
 * admin↔author drafting thread — so each page sorts by the conversations
 * it actually shows. Zero when there are none. */
export function latestCommentAt(topic: ManagedTopic): number {
  return Math.max(
    latestIn(topic.comments),
    latestIn(topic.hostOnlyComments),
    latestIn(topic.adminComments),
  );
}

/** Needs-attention order: awaiting review first, retired last. */
const STATUS_ORDER: Record<TopicStatus, number> = {
  submitted: 0,
  published: 1,
  unpublished: 2,
  archived: 3,
};

type Comparator = (a: ManagedTopic, b: ManagedTopic) => number;

const byUpdated: Comparator = (a, b) =>
  Date.parse(b.updatedAt) - Date.parse(a.updatedAt);

const COMPARATORS: Record<ManagedSort, Comparator> = {
  updated: byUpdated,
  comments: (a, b) =>
    latestCommentAt(b) - latestCommentAt(a) || byUpdated(a, b),
  status: (a, b) =>
    STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || byUpdated(a, b),
  title: (a, b) => a.title.localeCompare(b.title),
};

export function sortManagedTopics<T extends ManagedTopic>(
  topics: T[],
  sort: ManagedSort,
): T[] {
  return [...topics].sort(COMPARATORS[sort]);
}
