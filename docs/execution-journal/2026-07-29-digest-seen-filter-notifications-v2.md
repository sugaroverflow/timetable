# Digest skips already-seen; Notifications page sections + filters

**Date:** 2026-07-29

- **Digest = only what you haven't seen in the app.** Each section now
  checks the member's per-forum watermarks on top of the digest window:
  new topics and heart counts against `lastSeenFeedAt` (they were on the
  All Topics page you visited), replies and comments against
  `lastSeenNotificationsAt` (they were on the Notifications page). The
  host-activity counts moved from SQL GROUP BY to per-row counting so
  each event can be tested against its forum's watermark. Assignment
  notices keep the plain window — there's no surface watermark that
  proves you saw one.
- **Notifications page** now has two headed sections: "Settings" (the
  email-digest card) and "Notifications" (the cards).
- **User + role filters** on the notifications list — the same
  `ActorFilter`/`ActivityRoleFilter` controls the activity log uses
  (`?actor=` / `?role=`), with custom role labels. Backed by a new
  `authorRoles` field on the Notification API type (author's membership
  roles; empty for ex-members). Filtered-empty state distinct from
  truly-empty.
