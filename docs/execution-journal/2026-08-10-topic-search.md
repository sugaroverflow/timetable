# 2026-08-10 — Topic search lands in the glass pill

Backlog item 17, second half (design parked 2026-07-28, revived by Ed
today): a search box on All Topics. The shelved design survives intact —
substring match, `?q=` in the URL — with one placement change: the box
rides inside the new frosted-glass filter pill.

- **Core**: `buildFeed` gains `q` — case-insensitive substring over
  title + body markdown + host name, applied in the same in-memory
  filter pass as the hearted/host filters (the feed already loads all
  of a forum's published topics per request, so no query change; FTS
  stays unnecessary at forum scale).
- **API**: `topicFeed(q:)` passes through.
- **Web**: `FeedSearch` (icon-led bare input in the pill, 84px growing
  to 170px on focus) debounces 350ms into `?q=` via a new
  `replace: true` option on `useSetSearchParam` — typing doesn't pile
  up history entries, but the result URL is shareable and survives the
  shuffle-seed redirect. `q` threads through `fetchFeedPage` →
  `loadMoreFeed` → `InfiniteFeed` (infinite scroll stays correct under
  a filter), joins the remount key, and gets a tailored empty state
  ("No topics match …").
- Search composes with everything: host filter, sort (matches keep the
  active order, including the stable shuffle), ❤️/💙 views.
