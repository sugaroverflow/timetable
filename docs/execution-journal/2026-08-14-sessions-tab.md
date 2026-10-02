# Sessions tab: a topic's future sessions on its feed card

**Date:** 2026-08-14
**Trigger:** the elector side of demand-first scheduling (issue #275; see
`2026-08-14-topic-workbench.md` for the host side). A member weighing a ❤️
should see when a topic might run — and mark their availability — without
leaving the card. Decisions made by Ed up front: visible to everyone who
can see the card (sessions are public on the calendar page), write
affordances by role; the inline toggle is the elector's EXISTING per-slot
calendar write, re-homed; and NO group washes/tints/avatar counts here —
whether electors may see group availability is a deliberately deferred
privacy question.

## Changes

- **`topicSessions(idOrSlug, topicId)`** (`apps/api/src/graphql/slots.ts`):
  new lazy query → `[TopicSession]` where each row is `{ slotId, startsAt,
  endsAt, status, location, viewerState }` for future slots (endsAt ≥ now)
  carrying one of this topic's sessions. `viewerState` is the viewer's OWN
  🟢🟡🔴 resolved through the calendar's layering (explicit → pattern cell
  → 🟡); null signed out. Null-for-gated (`topicWeightedBreakdown`
  precedent): unreadable forum / calendar off / foreign or unpublished
  topic — but anonymous viewers of a readable forum DO get rows. Counts
  and perUser are never selected or exposed.
- **`sessionSlotCount`** on the `Topic` type (`graphql/topics.ts`): int
  count of the topic's sessions on future slots, so the feed knows whether
  to show the tab without fetching rows. Batch-attached in
  `decorateFeedTopics` (feed + permalink) and the queue's current-topic
  path — the `viewerHasHostHearted` idiom — via one `inArray`+`group by`
  query per page; skipped entirely (0) while the calendar is off (new
  `calendarEnabled` member of `TopicViewFlags`). Cost: one scalar per
  topic against the query budget, one batched query per page.
- **Core** (`packages/core/src/calendar.ts`): `listTopicSessions`
  (sessions × future slots for one topic + the viewer's own availability
  resolution, reusing `resolveState`/`getAvailabilityPattern`) and
  `countTopicSessionSlots` (batched per-topic counts, the
  `loadCommentStats` idiom). Both use the `gte` operator, never raw sql
  templates (Date-mapping gotcha).
- **`SessionsTabBody.tsx`** (part name: **sessions-tab**): client body of
  the new Sessions tab in `buildFeedSections` (`TopicCard.tsx`) — value
  `schedule`, icon `schedule`, text "Sessions", count badge; appears when
  `sessionSlotCount > 0` on feed/permalink/queue cards (NOT My Topics,
  whose host has the Scheduling tab). Fetches on first mount (inactive
  panels unmount, so mounting = tab opened — the `TopicScheduleBody`
  idiom). Rows: en-GB date with year (flat list, terms may span years) +
  time, SessionLine's status pill ("✎ pencilled" / "confirmed", location
  once confirmed), and for electors the reused `AvailabilityControl`
  (compact) — extended with an optional `onSet` callback so the
  client-fetched row state updates after a save (the calendar page's
  server-rendered rows keep relying on the router refresh). A quiet
  "Open the calendar" link closes the stack.
- **`topicPerms`** (`feedPage.ts`): new `canSetAvailability:
  isElector(roles)` on `FeedPerms` — same gate as the calendar page's
  toggle, derived in the one place card perms come from.
- `TOPIC_FEED_FIELDS` (`gqlFragments.ts`) + web `FeedTopic`
  (`feedTypes.ts`): `sessionSlotCount` selected everywhere a TopicCard is
  fed (feed, permalink, queue share the fragment).
- Docs: PRODUCT.md sessions-tab paragraph under demand-first scheduling,
  ARCHITECTURE.md query list, CLAUDE.md glossary (**sessions-tab**).

## Tests

`app.integration.test.ts`: topicSessions maps rows for a member (incl.
viewerState); anonymous gets rows with viewerState null (resolver passes a
null viewer); unreadable forum / calendar off / foreign topic /
unpublished topic all null without touching `listTopicSessions`.
sessionSlotCount: served from the batched `countTopicSessionSlots` on
topicFeed (buildFeed mocked); calendar off → 0 without calling it. The
future-only cut itself is SQL (`gte(timeslots.endsAt, now)`), covered by
construction like `listSlots`.

## Notes

- The tab strip concept is being renamed "topic-tabs" ("sessions tab",
  "comments tab") — docs use that vocabulary; code identifiers
  (`CardSectionTabs` etc.) are untouched pending a separate rename pass.
- `sessionSlotCount` is gated on the forum's calendar flag so a disabled
  calendar can't grow a tab whose query would return null.
- Deliberately absent: group availability in any form (washes, counts,
  perUser) — deferred privacy question, do not add casually.
