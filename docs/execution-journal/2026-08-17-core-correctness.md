# 2026-08-17 — pre-prod audit: core/db correctness pass

Third instalment of the audit (after the API and web hardening entries).
The audit's clean list was substantial — no raw-sql Date bugs anywhere,
all four race-prone gestures (pencil, confirm, heart, invite-accept)
DB-constraint-backed, migrations 0030–0039 safe against the real prod
dataset, shared-package purity intact. What needed fixing:

- **Two hot-path indexes** (migration 0040): `comments_author_idx` — the
  digest cron's `loadChainScope` selects by author for every recipient,
  which was a nightly full scan of the biggest table; and
  `slot_sessions_topic_idx` — `sessionSlotCount` runs topic-first on
  every feed page while every existing index leads with slotId. Free to
  add now: prod's calendar tables are still empty.
- **`assignmentActivities` forum scoping** — the topic.reassign sweep had
  no timetable predicate, so it seq-scanned all of `activity_events` per
  recipient (correctness was fine; foreign rows were dropped later). Now
  `inArray(timetableId, ctx.forumIds)`, which the existing
  `(timetableId, createdAt)` index serves.
- **First-digest window bound** — a new membership with no per-forum
  watermark fell back to `users.lastDigestAt`, which nothing has written
  since the 2026-08-11 per-forum split: a member joining today would get
  a first digest spanning months. The fallback is now floored at the
  configured window.
- **Invite expiry enforced** — `expiresAt` was written since day one and
  checked nowhere; a stale invite kept granting its original roles
  forever. `claimInvitesForUser` now skips expired rows (legacy null
  TTLs still claim).
- **Idempotent invite claim** — concurrent first-sign-in paths could
  double-insert the membership (500) and double-log `member.first_login`
  (duplicate "new members" digest rows). The membership insert is now
  `onConflictDoNothing` on its unique, the accept update carries a
  `status='pending'` guard, and first_login logs only on the request
  that actually flipped the invite.
- **No more ownerless forums** — if seeding the owner membership fails
  mid-`createTimetable`, the forum row is deleted again (compensating
  delete; the row is invisible until membership exists, so the window is
  harmless).
- **Concurrent double-pencil is a friendly error** — the pencil uniques
  (slot_topic / slot_oh_host) now map 23505 to "Already pencilled in at
  this time" like the confirm path always did, instead of a 500.
- **Slug generation in one query** — `ensureTopicSlug`/`ensureMemberSlug`
  ran one query per candidate suffix (40 "Untitled" topics = 40
  round-trips) — now one LIKE-family query + smallest-free-suffix in JS.
  The check-then-insert race remains narrowed, with the per-timetable
  unique as backstop.

Deferred to the backlog (audit findings judged not prod-blocking):
per-forum digest watermarks after partial send failures, jsonb merge for
concurrent settings saves, batching the export's per-slot comment
queries, UTC-weekday digest scheduling, transactions around bulk slot
creation and proposeSlot, digest_sends retention.
