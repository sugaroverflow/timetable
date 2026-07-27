# 2026-07-27 - Feed stays put after actions (random-sort reshuffle fix)

## What happened

Admin QA: scrolling the (default random-sort) feed, editing a topic, and
saving reshuffled the whole feed — the just-edited topic vanished to a
random position. Same for any action that refreshes (hearts, comments,
moderation). Root causes, both fixed:

1. The default random sort minted a fresh shuffle seed **per server
   render** (URL had no seed unless the user explicitly picked Random),
   so the `router.refresh()` every mutation performs re-dealt the order.
2. Infinite-scroll pages beyond the first are client-state snapshots
   (`InfiniteFeed` keeps server-action-rendered cards in state), so a
   refresh updated page 1 but left deeper pages stale — with a new seed
   that also meant duplicates/overlaps between page 1 and the stale rest.

## Implementation

- **Seed rides the URL always**: `/feed` (and person pages, which use the
  same random pattern) now mint the seed and immediately `redirect()` to
  the same route with `?seed=` set. `router.refresh()` re-renders the
  same URL → same seed → same order. Fresh navigations still reshuffle —
  the redirect mints a new seed per visit, so the "random each visit"
  product behaviour (QA #59) is preserved.
- **Appended pages re-sync after refresh**: `InfiniteFeed` takes a
  `refreshToken` (a fresh random value per server render). When it
  changes — i.e. after a successful action's refresh — the component
  re-fetches every already-loaded page via the same `loadMore` server
  action. Same seed → same order, fresh content, so an edit or heart on
  a deep-scrolled card updates in place. On re-fetch failure the stale
  pages are kept (next scroll or refresh retries).

Nothing changed for explicit sorts (Newest, Latest comments, hearts):
they were already deterministic; they now also benefit from the appended-
page re-sync.
