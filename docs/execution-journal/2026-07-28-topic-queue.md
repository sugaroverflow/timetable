# Topic Queue

**Date:** 2026-07-28

User feedback: people fear missing topics in the big list, and scrolling
past isn't reading. Ed's design, refined in discussion: a **Queue** option
in the All Topics sort menu that shows one unhearted topic at a time with
❤️ / Later buttons — plus an explicit end-of-round moment instead of an
infinite cycle, so hearts stay honest (hearting is never the only way out).

## Mechanics

- Per-user deterministic shuffle: order by `md5(userId:topicId)` — stable
  across sessions/devices with no stored ordering, different per user so
  topics get even exposure (the Shuffle fairness instinct).
- `topic_seen` (topicId, userId, seenAt) records exposure; "Later" and any
  ❤️ (from any surface — `toggleHeart` upserts it) mark a topic seen.
- `timetable_memberships.queueRoundStartedAt` is the round watermark:
  seen-before-it topics come around again after "Start another round".
  Null = first round.
- Topics **published after the round started are 🆕**: they jump to the
  front of the queue, and the menu label shows `Queue (43+5🆕)`.
- End of round is a stop, not an auto-restart: "That's every topic — you've
  seen all N and currently ❤️ k", with restart as an explicit button.
- Elector-only (`canHeart`): guests/hosts/admins get no Queue option and
  `topicQueue` resolves null; `?sort=queue` falls back to the list.

## Surfaces

- GraphQL: `topicQueue(idOrSlug)` → `{ remaining, remainingNew, roundSize,
  current: Topic }`; mutations `queueMarkSeen(topicId)`,
  `queueRestartRound(idOrSlug)`. (Public naming — no timetable words.)
- Web: `?sort=queue` renders the full `TopicCard` (body expanded — deciding
  needs the whole thing, comments included) + the decision bar; the feed
  query selects queue counts for the menu label.
- Analysis: the Elector activity table gains a sortable **Queue** column =
  published topics the elector has *never* seen nor ❤️'d (ever-seen, not
  round-relative, so personal round restarts don't distort the admin view).

## Privacy stance

Per-topic "Later" decisions never leave the user's own view; admins see
only the aggregate coverage count, alongside the ❤️/comment counts the
table already showed.
