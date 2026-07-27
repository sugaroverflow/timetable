# 2026-07-25 - Sorting for My Topics and Pending Topics

## What happened

QA request: the My Topics and Pending Topics lists were hard-ordered by
`updatedAt desc` with no user control. Both now have a sort dropdown like
the feed's, reusing the feed sorts that make sense for unpublished lists
(hearts/random don't apply). Specifically requested: Pending Topics
sortable by most recent comment in the admin↔author drafting thread.

## Implementation

Sorting is client-side (well, server-component-side) in the web app — both
lists are small, unpaginated, and already fetch their comment trees, so no
API/core changes were needed. The sort rides in a `?sort=` URL param like
the feed's.

- `apps/web/src/lib/managedTopicSort.ts` — sort options, normalizer, and
  comparators over `ManagedTopic`. "Latest comment" takes the newest
  timestamp across whatever threads the page fetched (nested replies
  included): all three threads on My Topics, only `adminComments` on
  Pending Topics — so the pending sort is exactly the drafting-thread
  conversation, per the request. Commentless topics sink to the bottom,
  tie-broken by `updatedAt`.
- Sorts: My Topics — Recently updated (default), Latest comments, Status
  (submitted → published → unpublished → archived), Title A–Z. Pending —
  Recently updated (default), Latest comment, Title A–Z.
- `apps/web/src/components/ListSortControl.tsx` — generic select over the
  option lists via `useSetSearchParam`; like `FeedSortControl` minus the
  shuffle-seed logic. Hidden when a list has fewer than two items.
- Unit tests in `managedTopicSort.test.ts` (vitest).
