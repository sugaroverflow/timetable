# 2026-08-28 — the Back button comes home (People anchors, feed position)

Ed, from live QA: "As a host, when I go to the people page, click on a host
in the table of contents, then click on a host's topic, then press back,
I'm taken to the top of the people page instead of to the person that I'd
previously been on. In general going back in the browser feels fragile."

Two unrelated causes, both fixed here.

## 1. The People table of contents made history entries Next ignores

`PeopleContents` was the last place in the web app using a bare
`<a href="#person-…">`. That matters more than it looks. A fragment link
is navigated by the BROWSER, not by the router, and the session-history
entry it creates carries `history.state === null`. Next 16's popstate
handler opens with `if (!event.state) return` — it deliberately ignores
any entry it did not create (`next/dist/client/components/app-router.js`,
the `onPopState` callback).

So pressing Back onto one of those entries did nothing at all: the URL
became `/f/<slug>/people#person-<id>` while React carried on rendering the
topic page you had just left. Pressing Back again then landed on the entry
*before* the anchor click — the un-anchored `/people` — which the router
does own, so it rendered, at the top. Hence Ed's report.

Verified on dev before changing anything: clicking a fragment link took
`history.state` from `{__NA: true, __PRIVATE_NEXTJS_INTERNALS_TREE: …}` to
exactly `null`; a client-side navigation away and then Back fired popstate
with a null state and left the previous page on screen under the new URL;
a second Back rendered the un-anchored page at scroll 0.

The fix is to use `next/link` for the two jump links, which is what every
other table of contents in the app already does (`PageTopicToc`, the
comment timestamp permalinks). Next has an explicit `onlyHashChange` path
(`segment-cache/navigation.js`) that scrolls to the fragment and pushes an
entry the router owns, so Back comes home to the person.

**Rule going in the glossary: in-page jump links use `Link`, never a bare
`<a href="#…">`.** The failure is silent, it only shows up one navigation
later, and the two spellings look identical in review.

## 2. The feed forgot how far down you were

Separately — this is the "fragile in general" half. `InfiniteFeed` keeps
its appended pages in React state. Opening a topic is a route change, so
the feed subtree unmounts and that state is destroyed. On Back the page
re-renders with only its server-rendered first page, the document is far
shorter than the offset the browser is trying to restore, the restore
clamps, and you are at the top with no way back to your place. The deeper
you had scrolled, the more it lost.

**feed-position-store** (`lib/feedPosition.ts`) remembers two numbers per
feed view — pages appended and scroll offset — and `InfiniteFeed` replays
them on the way back: refetch that many pages, then scroll, in an effect
that waits for the commit that actually puts the cards in the DOM.

Deliberate choices:

- **Module-level, not `sessionStorage`.** Same reasoning as
  [[comment-draft-store]]: this is a within-visit convenience, so it dies
  with the JS context and a reload is a clean slate. (Unlike a topic
  draft, nothing here is worth carrying into a new session.)
- **Only a history traversal restores.** A popstate arms the store; any
  click disarms it, because a click-initiated navigation is not a
  traversal. Without the disarm, a Back onto a page with no feed would
  leave the flag set, and a later click-through to a feed you had once
  scrolled deep would dump you back down the page unbidden. Note the
  default sort mints a fresh shuffle seed per visit, so its key differs
  on a fresh visit anyway — the gate is what protects the fixed sorts.
- **Keyed by the feed view**, the same string used as the element `key`
  (sort, host, ❤️/💙 filter, seed, search), plus the forum slug — the
  person page's `key` does not carry the slug and the store is app-wide.
- The restore and the after-an-action refresh now share one `fetchPages`
  helper; both replay pages the user already had, and they were drifting
  apart as two copies of the same loop.

Residual, and worth knowing: the browser still performs its own (clamped)
restoration before our pages arrive, so a deep restore shows the top of
the feed for as long as the replay takes and then jumps. Removing that
would mean taking `history.scrollRestoration` to `manual` app-wide and
owning scroll restoration on every page, which is a much larger change
than this bug justifies.

## The framework-native alternative, deliberately not taken

Next 16 can solve this class of problem itself. With **Cache Components**
(`cacheComponents: true`), Next stops unmounting pages on navigation and
hides them with React's `<Activity>` instead, keeping the DOM in the
document — which preserves React state, scroll positions, form drafts and
expanded panels for the last 3 routes, for free, on every page
(`node_modules/next/dist/docs/01-app/02-guides/preserving-ui-state.md`).
That would retire this store, and would very likely retire
[[comment-draft-store]] and shorten [[topic-draft-recovery]] too.

It is not a config flag you flip on a bug fix: it changes caching and
rendering semantics app-wide and ships with its own migration guide
(`02-guides/migrating-to-cache-components.md`), and it needs decisions
about what SHOULD reset between visits (a dropdown left open is the
doc's own example of state you must explicitly throw away). Worth a
proper evaluation in the holidays — it points at deleting code rather
than adding it. Logged for the backlog, not attempted here.

## Verification

The anchor half is verified end-to-end on dev, by instrumenting
`history.state` and popstate around the real navigation sequence. **The
feed half is not yet verified live** — it needs a signed-in session on a
forum with more than one page of topics, which is Ed's to drive. The
mechanism it rests on (a route change unmounts the subtree, so the
appended pages are gone) is not in doubt; what wants checking on dev is
the feel: scroll well down All Topics, open a topic, press Back, and land
where you were.
