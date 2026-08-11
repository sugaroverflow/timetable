# 2026-08-11 — Digest kinds round 2: follow kinds + hosts

Ed's pruning pass kept all nine switches and added four follow-shaped
kinds, so the set is now thirteen:

- **commentsHearted / commentsHostHearted** — comments on topics the
  recipient follows with a ❤️ (elector) or 💙 (host). One shared
  collector (`followedCommentActivities`): public thread for ❤️ follows,
  plus the host-only thread for 💙 follows where that feature is on;
  excludes the recipient's own topics, own comments, and replies to them
  (each already its own kind), and the FEED watermark covers it (ambient
  discussion, like ❤️s). A topic followed both ways surfaces each
  comment once (❤️ wins).
- **sessionsHostHearted** — upcoming confirmed sessions for 💙'd topics;
  each session line rides whichever follow switch qualifies it.
  Availability asks stay ❤️-only — they're an availability question,
  which is elector business.
- **newTopicsHost** — hosts now get newly-published-topic cards
  (faculty awareness of colleagues' topics), closing the elector-only
  gap flagged earlier today. Own topics are excluded outright (an
  improvement for elector-hosts too), and a dual-role member gets the
  card when EITHER applicable switch is on.

Mechanics: `RawActivity` gains an optional `switch` tag for kinds whose
activity shape is ambiguous (a "comment" may be governed by three
different switches); the post-filter uses it over the kind-derived
default. The email template needed nothing — the new kinds reuse the
comment/session/new activity shapes.

Labels: the "(on by default)" scaffolding is gone (everything defaults
on); the "(host)"/"(elector)" role tags remain until the set is final.
