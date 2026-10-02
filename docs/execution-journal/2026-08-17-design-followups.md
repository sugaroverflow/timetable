# 2026-08-17 — audit follow-ups by Ed's numbers + page-topic-toc

Ed answered the audit's decision list; this PR carries the design items
(2/3/4/8) plus a fresh feature ask that arrived mid-round.

## Audit answers

- **Hidden comments get a look (2, "come up with something")**: the topic
  tree's `.comment.hidden` class had no rule — hidden comments looked
  identical to live ones for the moderators who still see them. Now the
  same treatment as the slot-discussion twin: the bubble dims to 50%
  (one shared rule with `.cal-comment-hidden`), the existing "hidden"
  head label says why.
- **`--faint` darkened (3)**: light `#6e7784` → `#616a77` — AA on both
  the page background (4.72:1, was 3.90 — the log timeline sits on bare
  `--bg`) and cards (5.47:1). The dark value already passed on both
  surfaces and is unchanged.
- **Tap targets (4, "try it")**: `.comment-actions button` and
  `.teaser-snippet` use the padding/negative-margin trick (≥24px hit
  area, zero layout movement); `.avseg-compact button` and
  `.cal-person-link` get invisible `::after` overlay pads (their visible
  pills/faces must not grow, and fold avatars sit ~3px apart so their
  horizontal expansion stays at ±2px).
- **`availabilityCount` / `slotCount` removed (8)**: gone from the
  GraphQL surface (ElectorActivity / Dashboard) and `slotCount`'s
  `countSlots` query gone from core (nothing else used it);
  `availabilityCount` stays in core — the activity filters and sort
  totals read it.

## page-topic-toc (new part, Ed's ask)

My Topics and the ❤️/💙 Topics pages open with a little table of
contents under the page title: the People-page profile-card topic-list
look (shared `person-topics` styles), bare on the background, hidden
below 2 topics. My Topics links jump to the cards below — `TopicManager`
cards gained `#topic-<id>` anchors with topbar-clearing scroll-margin —
in the current sort order. The ❤️/💙 pages link to permalinks instead:
their feed paginates at 20, so a topic's card may not be rendered yet;
a slim `HEARTED_TOC_QUERY` fetches the whole hearted list (same sort)
just for the TOC. Glossary entry added.
