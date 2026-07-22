## 2026-07-22 - Feed Query Batch: ~10x Fewer DB Queries per Feed Load

### Goal

Efficiency batch from the 2026-07-22 audit. A 20-topic feed page load cost
~122 DB queries for a host/admin viewer (~38 for electors). Five
behavior-preserving fixes bring that to ~13.

### Changes

- **Lazy ❤️ breakdown** (`apps/web/src/components/BreakdownToggle.tsx`):
  HostInsightsPanel (feed, eager — the feed query selected
  `weightedBreakdown` per topic, ~4 queries each) and
  DashboardBreakdownToggle (dashboard, lazy) merged into one lazy component
  that fetches `topicWeightedBreakdown` via clientGql on first expand.
  Collapsible classNames are props so both call sites keep their exact
  markup. `weightedBreakdown` removed from `TOPIC_FEED_FIELDS`
  (gqlFragments.ts) and from the web `FeedTopic` type. The GraphQL field
  itself stays (the lazy query and TopicLeaderboard use it).
- **Batched comment trees** (`packages/core/src/comments.ts`):
  `listCommentTreesForTopics(topicIds, opts)` — one `inArray` query grouped
  into per-topic trees; `listCommentTree` and the batch reader share the
  same row fetch + tree builder so they can't drift. The `topicFeed`
  resolver prefetches the page's trees (one query instead of one per
  topic); `Topic.comments` uses `prefetchedComments ?? listCommentTree`
  (permalink keeps the fallback). `hostDashboard` batches its three threads
  (public/host-only/admin) the same way — 3 queries instead of 3 per topic.
- **Request-scoped readable-timetable memo** (`apps/api/src/context.ts`):
  optional `ctx.readableTimetable(idOrSlug)` backed by a per-request
  `Map<string, Promise<...>>`; the feed document resolved the same
  timetable up to 4x (timetable, myFeedLastSeenAt, timetableHosts,
  topicFeed). All schema.ts call sites route through it via
  `readTimetable()` except setHeartsCountFrom's post-write re-read (must
  observe the write). REST handlers deliberately keep direct calls.
- **myTimetables dedup + invite claim off the hot path**:
  `apps/web/src/lib/myTimetables.ts` wraps the superset query (slug name
  privacy settings) in React `cache()` — the app layout and t/[slug] layout
  now share one fetch per request. The `myTimetables` resolver no longer
  calls `claimInvitesForUser` on every read: pending invites only exist for
  emails with no local account, and both row-creation paths claim them
  (sign-in JIT creation in auth/clerk.ts, and `createLocalUser` now claims
  too — closing the pre-created-account gap that the resolver call was
  papering over).
- **Digest cron parallelization**: the digest job processes recipients in
  concurrent chunks of 10 (one failure previously aborted the whole
  sequential run; it now aborts from its chunk). `computeUserDigest` was
  decomposed into per-channel section builders that run under
  `Promise.all` — same queries, now concurrent; digests.ts no longer needs
  its audit-debt lint disable.

### Query arithmetic (20-topic admin feed document; 21 = pageSize+1 rows)

Before ≈122: readable-timetable 4x2=8 + viewerHeartedPublishedCount 2 +
myFeedLastSeenAt 1 + timetableHosts 1 + buildFeed 5 + comments 21x1=21 +
weightedBreakdown 21x4=84 → 122. After ≈12: memoized readable-timetable 2 +
2 + 1 + 1 + 5 + batched comments 1 + breakdown 0 → 12 (~10x). Electors:
8+2+1+1+5+21=38 → 12 (~3x). On top of that, each navigation saves the
duplicate layout myTimetables round-trip (2 fetches → 1) and its
per-read invite-claim query.
