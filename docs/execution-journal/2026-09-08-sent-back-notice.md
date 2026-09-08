# 2026-09-08 — A host hears when an admin sends their topic back to drafting

## The ask

Ed, after #344 (admin "Back to drafting"): "A host should get a
notification that an admin has set their topic back to draft."

## Where it fits

Two notification channels, both driven off the activity log rather than
a notifications table. The calendar-v2 session kinds set the pattern:
the pane queries `activity_events` by action and joins the topic through
`payload->>'topicId'`. `setTopicReady` already logged `topic.unready`
with a topic id, so nothing schema-side was needed (additive-only rule).

## The change (`sent-back-notice` in the glossary)

- **Pane** — `listSentBackNotifications` in `core/notifications.ts`:
  `topic.unready` events on topics the viewer hosts, by someone other
  than the viewer (their own switch writes the same event). Counted into
  the unread badge. The pane sentence is "{Admin} moved your topic back
  to drafting: {Title}", linking to the My Topics card with the drafting
  tab open (`?tab=admin&topic=…#topic-…` — the tab must be named, an
  unvisited pane isn't in the page).
- **Digest** — `unreadyActivities` in `core/digests.ts`: the same event
  as an `unready` activity kind, modelled on `assignment` — no switch
  (admin override), counts as news so it sends on its own, "Sent back to
  drafting" pill on the card, "n topics sent back to drafting" in the
  subject. Skipped once the topic is no longer `submitted` (stale). Sample
  digest and the pill test carry it.

## Not done

No free-text reason rides with the notice — the drafting thread is the
channel, as since the request-changes flow went. If the button should
demand a note, that's a prompt UI + comment write: a separate ask.
