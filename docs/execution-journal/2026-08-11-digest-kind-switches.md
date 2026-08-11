# 2026-08-11 — Per-forum digest kind switches

Ed's ask: each user selects what kinds of activity land in their email
digests. Ed's follow-up sharpened the model: the digest is one email PER
FORUM, so the switches are per forum too — a membership setting, not a
user one. Cadence (never/daily/weekly + weekday) stays on the user: one
send schedule, one `lastDigestAt` watermark.

The Notifications page's digest card grows a "What to include from this
forum" block — one switch per activity kind, every kind switchable for
now (the set will be pruned), each label carrying a temporary
"(on by default)" / "(off by default)" suffix until the final
configuration is settled.

- **Shared**: `DIGEST_KINDS` (comments, replies, hearts, hostHearts,
  sessions, availabilityAsks, newTopics, assignments, drafts),
  `DIGEST_KIND_DEFAULTS` (all on — matching what digests carried before
  the switches existed), the `DigestKinds` map type, and
  `isDigestKindEnabled(kinds, kind)`; tests.
- **DB**: `timetable_memberships.digest_kinds jsonb '{}'` (migration
  0034) — `{}` = all defaults, so existing members are unaffected.
- **Core**: `loadDigestContext` carries each membership's switch set;
  `computeUserForumDigests` skips collecting a kind no forum wants, and
  every collected activity then filters against its own forum's
  switches. `availabilityAsks` gates per forum in the same pass.
  `getMembershipDigestKinds` / `updateMembershipDigestKinds` in profile.
- **API**: `updateMyDigestKinds(idOrSlug, kindsJson)` — a JSON
  {kind: boolean} object that replaces the stored set; unknown kinds
  dropped, malformed JSON rejected. `Forum.viewerDigestKinds` exposes
  the viewer's stored set for the form.
- **Web**: `DigestSettingsForm` saves cadence (user-global) and kinds
  (this forum) in one GraphQL request; the switch block shows whenever
  cadence isn't "Never".

The forum-level card (Settings → Email digest) is untouched — it stays
the single on/off default for new members.
