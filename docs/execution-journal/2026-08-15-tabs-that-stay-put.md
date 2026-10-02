# 2026-08-15 — tabs that stay put

Round 3 of Ed's topic-tabs QA, answering "when should I see the
host-comments tab? when should I see the admin-comments tab?"

Ed's rule, which is now the governing principle for the strip:

> Once you see a tab on a topic, it should always be there, otherwise
> you'll wonder where it's gone. So hosts will always see admin tab, and
> will see hosts tab as soon as a topic is published, wherever they see
> topics.

Two things were inconsistent with that.

## The drafting thread rides every card

It used to be a My Topics tab plus a collapsible panel under the permalink
card, and nothing at all in the feed or the queue — so a host's own topic
wore different tabs depending on which page they met it on.

Now `adminComments` is part of `TOPIC_FEED_FIELDS` and the drafting thread
is a tab wherever a `TopicCard` renders. The permalink's separate
`DraftingThread` panel is gone (it would have doubled it). Moderation keeps
its own `AdminCommentsPanel` — that page is a different kind of surface.

Two costs to keep an eye on, both handled:

- **Payload.** Two comment trees put `TOPIC_FEED_FIELDS` at roughly 230 of
  `GRAPHQL_MAX_COST` (500), and depth is unchanged (the new tree is a
  sibling of the old one, so the queue's deepest scalar still sits at
  8 + 3). The API returns `[]` to everyone but the topic's owner and
  admins, so nobody else's bytes grow.
- **N+1.** `Topic.adminComments` fell back to a per-topic query, which
  across a feed page would have meant one query per card for admins.
  `decorateFeedTopics` now prefetches the drafting threads in the same
  batched shape as the public ones, for exactly the ids the viewer is
  entitled to: all of them for an admin, their own for a host, none for
  anyone else — the batched query is skipped entirely in that last case.

## The faculty tab starts at publication

On My Topics the {host}-only tab appeared only once it had content — a
comment or a 💙 — which meant a host could never start a faculty
conversation, only reply to one, and their published topic showed fewer
tabs on My Topics than in the feed. It now follows the feed's rule:
visible from publication onward while the forum option is on. An
unpublished topic that somehow already has faculty content keeps its tab
too, since a tab you have seen must not vanish.

That rule needed the forum's host-comments option on My Topics, which it
had never been passed — `TopicManager` takes `hostCommentsEnabled` now.
Without it, a forum with the faculty thread switched off would have
sprouted an empty tab on every published card.

## Incidentally

`buildFeedSections` grew past the complexity limit with the fourth tab, so
it is now four small `…Section(args)` builders filtered for nulls —
the same shape `TopicCardTabs` already used for My Topics.
