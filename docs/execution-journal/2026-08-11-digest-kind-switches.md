# 2026-08-11 — Digest settings go fully per-forum

Ed's ask, sharpened over two rounds: each user selects what lands in
their email digests, and since the digest is one email PER FORUM,
EVERYTHING about it is a per-forum choice — on/off, cadence
(never/daily/weekly + weekday), and the per-kind switches all live on
the membership. Even the send watermark is per forum now, so forum A can
be daily and forum B weekly-on-Friday for the same person.

The Notifications page's digest card covers it all: the cadence controls
plus a "What to include" block — one switch per activity kind, every
kind switchable for now (the set will be pruned), each label carrying a
temporary "(on by default)" / "(off by default)" suffix until the final
configuration is settled.

- **Shared**: `DIGEST_KINDS` (comments, replies, hearts, hostHearts,
  sessions, availabilityAsks, newTopics, assignments, drafts) +
  `DIGEST_KIND_DEFAULTS` (all on); `MembershipDigestSettings`
  {enabled, frequency, weekday, kinds}; `effectiveDigestSettings`
  resolves membership → the user's stored globals → daily/Monday, so
  nobody's existing behaviour changes without a data migration; tests.
- **DB**: `timetable_memberships.digest_settings jsonb '{}'` +
  `last_digest_at` (migration 0034). A null membership watermark falls
  back to `users.lastDigestAt`, so the rollout never re-sends old
  windows.
- **Core**: `loadDigestContext(recipient, now)` resolves per-forum
  effective settings, keeps only enabled+due forums, and computes each
  forum's own window start; collectors prefilter on the earliest window
  and cut per forum (the same pattern as the per-forum seen
  watermarks). `computeUserForumDigests(recipient, now)` returns
  `{digests, dueForumIds}`; `markForumDigestsSent` advances every due
  forum's watermark, sent or quiet. `isDigestDue`/`digestWindowDays`
  now take effective settings.
- **API**: `updateMyForumDigestSettings(idOrSlug, enabled, frequency,
  weekday, kindsJson)` patches the membership;
  `Forum.viewerDigestSettings` feeds the form. The old user-level
  digest args on `updateMyNotificationSettings` remain as the fallback
  layer (also where forum digest defaults are seeded at join).
- **Web**: the digest card reads effective settings and saves
  everything to this forum's membership in one mutation.

The forum-level defaults card (Settings → Email digest) is untouched —
it still seeds the user-global layer at join; moving that seeding to
the membership is a candidate for the pruning pass.
