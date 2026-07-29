# Digest becomes all-or-nothing — per-section toggles removed

Ed (launch QA): "Why are we even letting people choose whether they want
(New topics / Replies to my comments / Activity on my topics) in their
digests? We should just put them all as included and not have the
controls."

## What changed

- `NotificationSettings` gains a single **`digestEnabled`** master switch;
  the three per-section flags (`digestNewTopics`, `digestReplies`,
  `digestActivity`) are deprecated but kept in the type so stored jsonb
  still parses.
- New `isDigestEnabled()` helper in `@timetable/shared`: an explicit
  `digestEnabled` wins; otherwise **any legacy flag true reads as
  enabled**, so nobody subscribed before the switch loses their digest,
  and nobody who had everything off gets opted in.
- `packages/core/digests.ts`: recipient filter uses the helper; the
  per-section guards in `newTopicRows`/`replyRows` and the
  `digestActivity` gate on comments/hearts are gone — every digest
  includes every section.
- GraphQL: `updateMyNotificationSettings` and `updateForumSettings` swap
  the three boolean args for one `digestEnabled` arg (breaking, but the
  web app is the only consumer).
- Web: `DigestSettingsForm` (Notifications page) is now one "Email me
  digests" checkbox with the frequency/weekday controls shown only when
  on; `EmailDigestForm` (Forum Settings defaults card) is one "Send
  digests to new members" checkbox plus the send-test button.
- Seed users get `{ digestEnabled: true }`; integration test and a new
  `settings.test.ts` cover the arg surface and the legacy fallback.

No data migration: old jsonb keys are inert once `digestEnabled` is
written, and correctly interpreted until then.
