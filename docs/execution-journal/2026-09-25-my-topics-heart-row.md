# 2026-09-25 — My Topics cards get the ❤️ row

## The ask

Ed: "Topics on the My Topics page don't have the ❤️ action row which they
have in the All Topics feed and elsewhere. I'd like to add it there."

Confirmed missing: `TopicActionsRow` had one caller (the feed card), and
`ManagedTopic` carried no ❤️ data at all. My Topics had been growing
toward "feed-identical cards" piece by piece since QA #59; the ❤️ row was
the one piece never carried across, and nothing recorded a decision to
leave it out.

## Decisions (Ed, one at a time)

1. **Which cards.** First "every card, even drafts", then — once it was
   clear a draft has no Comments tab to host the row — "don't show it on
   drafts". Drafts have never been live and so never have ❤️s.
2. **Unpublished and archived** get the count too, and their Comments
   tab now always shows to carry it.
3. **Dormant ❤️s, labelled.** The finding that shaped this: unpublishing
   KEEPS the ❤️ rows, but every reader (`loadPublishedHearts`: feed
   count, breakdown, weights, Analysis) counts only published topics —
   deliberately, so electors get their vote share back while a topic is
   down, and republication restores it. Reusing the feed's count would
   have shown ❤️ 0 on every retired card. Ed chose to show the dormant
   number, labelled "paused while unpublished/archived", with a
   names-and-dates breakdown and no weights (weights exist only among
   published topics).

## What was built

- **managed-heart-fields** — `heartCount` / `viewerHasHearted` on
  `ManagedTopic`, batched in `hostDashboard` through
  `loadTopicHeartSummaries` (`packages/core/src/topics.ts`). It counts the
  same rows the feed does (heartsCountFrom cutoff + active-member-filter)
  without the published-only condition, so a published topic's number is
  identical on both pages and a retired topic's is its dormant ❤️s.
  Other ManagedTopic resolvers fall back to a single-topic lookup.
- **my-topics-heart-row** — `TopicActionsRow` leading the My Topics
  Comments tab (`MyTopicsTabs.tsx`), exactly where it leads the feed's.
  Published: the full row (❤️ button for electors, 💬, breakdown, "your
  vote" chip — `viewerHeartedPublishedCount` joins the page query). Its
  new `dormant` mode (retired topics): count only, "paused while …", no
  💬 (no composer to focus), and `DormantBreakdownBody`.
- **`topicDormantHearters`** — a NEW query rather than widening
  `topicWeightedBreakdown`: that one answers any reader of the forum by
  topic id, which is harmless while retired topics return nothing but
  would leak who ❤️'d an unpublished topic. The new one answers only
  `canEditTopic` (owner or admin), and only for non-published topics.
- `BreakdownTable` gained `weights={false}` (names + dates, sorted by
  date).

No schema change; nothing written differently.
