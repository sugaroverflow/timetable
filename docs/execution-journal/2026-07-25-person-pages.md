# 2026-07-25 - Person Pages (/t/[slug]/[userSlug])

## What happened

QA request: `/t/<forum>/<host-name>` (the segment already used in topic
permalinks) should be a real page showing the same as `/feed?host=<id>`;
electors get a profile + their hearted topics; host+electors get topics
first, hearted underneath. Profile photos render ~200px on desktop and
photos link to these pages.

## Implementation

- New route `apps/web/src/app/(app)/t/[slug]/[hostSlug]/page.tsx` — resolves
  the member by user slug (`person(idOrSlug, userSlug)`), 404s otherwise.
  Renders `PersonProfileCard` (new shared component, also used by the
  host-filtered feed) + up to two `InfiniteFeed` sections that page
  independently: their published topics (hosts), topics they heart
  (electors).
- Core `buildFeed` gains `heartedBy?: string` (filter by any user's current
  hearts, not just the viewer's); exposed as `topicFeed(heartedBy:)` and
  threaded through `fetchFeedPage`/`loadMoreFeed`/`InfiniteFeed`.
- Core `getPersonBySlug` + GraphQL `person` accepts `userId` OR `userSlug`
  (userId now optional; existing callers unaffected).
- `.profile-photo-xl`: 200px (120px ≤640px). The bio modal's photo and the
  feed host card's photo link to the person page.

## Privacy note (deliberate product decision)

Per-topic heart breakdowns were host/admin-only (`weightedBreakdown`); an
elector's person page now lists their hearted topics to anyone who can read
the forum. Requested explicitly during launch QA.

## User slugs

`users.slug` is globally unique, auto-regenerated on display-name change
(`updateUserProfile`), reserved-segment-safe (`RESERVED_SEGMENTS`). Person
pages resolve BY slug, so a rename breaks old person-page URLs (topic
permalinks are immune — they resolve by topic slug and 301 stale host
segments). Editable slugs would need redirect history or a by-id fallback.
