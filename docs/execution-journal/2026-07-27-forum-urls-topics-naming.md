# 2026-07-27 - /f/ URLs and de-social-media naming

## What happened

Ed: "feed" sounds like social media, and `/t/` predates the forum rebrand.
One coordinated rename (executed after PRs #114-#120 merged, to avoid
conflicting with all of them):

- URLs: `/t/[slug]/…` → **`/f/[slug]/…`**
- The browsing page: "Topic Feed" → **"All Topics"**, `/feed` → `/topics`
- My Topics: `/topics` → **`/my-topics`** (freeing `/topics` for the above)
- Sort label: "Random" → **"Shuffle"** (value stays `random`)
- Admin nav: "Settings" → **"Forum Settings"** (it's admin-only)
- Copy: guest notice ("You're viewing this forum as a guest…"), hearted
  empty-state, sysadmin "active" gloss — plus **"❤️" replaces the word
  "heart"** in user-facing text where it reads naturally (sort optgroup,
  empty states, person page "Topics they ❤️", analytics labels).

## Redirects (never remove)

`next.config.ts` permanent redirects keep every old link working — sent
digest/invite emails link to `/t/…`:

- `/t/:slug/feed` → `/f/:slug/topics` (before the blanket rule)
- `/t/:slug/topics` → `/f/:slug/my-topics` (old My Topics bookmarks)
- `/t/:path*` → `/f/:path*`
- `/f/:slug/feed` → `/f/:slug/topics` (muscle-memory hybrid)

## Unchanged by convention

Internal identifiers keep their names (`buildFeed`, `InfiniteFeed`,
`lastSeenFeedAt`, `feed-toolbar`, sort value `random`, `loadMoreFeed`),
as do `/timetables` and the GraphQL schema. `my-topics` joined
RESERVED_SEGMENTS so no member slug can shadow it. CLAUDE.md records the
new canon; PRODUCT.md gains the full copy/tone review todo.
