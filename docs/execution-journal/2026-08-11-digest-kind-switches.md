# 2026-08-11 — Per-kind digest switches

Ed's ask: each user can select what kinds of activity land in their email
digests. The Notifications page's digest card grows a "What to include"
block — one switch per activity kind, every kind switchable for now (the
set will be pruned), each label carrying a temporary "(on by default)" /
"(off by default)" suffix until the final configuration is settled.

- **Shared**: `DIGEST_KINDS` (comments, replies, hearts, hostHearts,
  sessions, availabilityAsks, newTopics, assignments, drafts),
  `DIGEST_KIND_DEFAULTS` (all on — matching what digests carried before
  the switches existed), `NotificationSettings.digestKinds`, and
  `isDigestKindEnabled` (absent keys fall back to the default); tests.
- **Core**: `computeUserForumDigests` consults the recipient's switches
  before collecting each kind — a switched-off kind is never queried, and
  `availabilityAsks` gates the "Can you make it?" section.
- **API**: `updateMyNotificationSettings(digestKindsJson:)` — a JSON
  {kind: boolean} object that replaces the stored set (the form always
  sends every switch); unknown kinds/malformed JSON are ignored like the
  other digest arg guards.
- **Web**: `DigestSettingsForm` shows the switch rows whenever cadence
  isn't "Never" and submits the full set alongside cadence/weekday.

The forum-level card (Settings → Email digest) is untouched — it stays
the single on/off default for new members.
