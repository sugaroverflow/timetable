# 2026-09-03 — renaming a draft from its permalink 404'd

Ed: "When a host edits a topic name and presses submit, they are taken to
404, because it reloads the topic with the old url, but the url has
changed."

## Cause

Two correct rules met badly. A draft's slug FOLLOWS its title until first
publish (`updateTopic` in `packages/core/src/topics.ts`) — a draft's URL
is in nobody's inbox yet, so it is free to become readable, and the freeze
at publish is what keeps digest links alive. And every mutation in the web
app finishes with `router.refresh()` (`useGqlAction`), which re-renders
the CURRENT URL with fresh server data. Rename a draft from its own
permalink and the current URL is the old slug; the permalink page resolves
by slug, finds nothing, `notFound()`. The mutation had succeeded and the
toast said "Topic updated". Feed cards and My Topics were fine — those
pages aren't addressed by the topic's slug.

## Fix

`TopicEditForm` now asks the mutation for the topic's new `slug` and
`hostSlug`, builds the old and new permalinks with `topicPath`, and — only
when the page you're on IS the old permalink and it moved — calls
`router.replace(new)` instead of refreshing. Everywhere else the refresh
runs as before. The form is left mounted during the navigation rather than
closed, so the card doesn't flash its stale title while the new page loads.

`useGqlAction`'s `refresh` option can now be a function of the mutation
result, so a success handler that navigated can veto the refresh (a
navigate-then-refresh would fetch the new page twice). The scoped edit
sites (`TopicCard`, `TopicManager`, `ModerationCard`) pass the topic's
current slug through so the form knows the "before" address.

## Not done: slug history

The fuller answer is remembering old slugs server-side and redirecting
from them, the way the host segment already redirects after a
reassignment (`redirectIfStaleHost`). That would keep a draft link a host
pasted somewhere alive across a rename. It needs a table and is more than
this bug warrants; worth revisiting if hosts turn out to share draft
links.
