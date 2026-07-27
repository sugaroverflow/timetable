# 2026-07-27 - Sysadmin dashboard (/admin)

## What happened

Ed asked for a global operator view of the deployment: every forum ever
created, activity measures, owner contact, a delete-forum control, and an
opt-in email whenever a new forum is created. Access is restricted to
sysadmins — Ed and @sugaroverflow.

## Implementation

- **Sysadmin identity is config, not data**: `SYSADMIN_EMAILS` (API env,
  comma-separated, case-insensitive) — no migration, per-environment
  control, checked by `apps/api/src/auth/sysadmin.ts`. Production default
  is empty (nobody); non-production defaults to the seeded dev admin
  (`admin-edwin+clerk_test@example.com`) so dev/local QA works with zero
  config. Production values must be set in the DO app spec at cutover.
- **`/admin` page** (`apps/web/src/app/(app)/admin/page.tsx`): table of
  all forums (name → feed link, privacy, created date, member count,
  active-in-30d count, topic count, owner name + mailto email) plus the
  new-forum email toggle. Non-sysadmins (and anonymous) get a 404. No nav
  link — sysadmins know the URL.
- **"Active" = opened the forum's feed in the last 30 days**
  (`lastSeenFeedAt` watermark) — the closest thing to a login the app
  tracks; the API doesn't observe Clerk sign-ins.
- **GraphQL**: `sysadminForums` query (empty list for non-sysadmins),
  `User.isSysadmin` field; `updateMyNotificationSettings` gains
  `newForumEmails` (rides the existing `notificationSettings` jsonb —
  additive, no migration; harmless if a non-sysadmin sets it since the
  sender only mails SYSADMIN_EMAILS accounts).
- **Delete** is REST `DELETE /api/timetables/:id`, sysadmin-only, hard
  delete: memberships/invites/topics/comments/hearts/activity/timeslots
  all cascade at the DB level (verified against the schema). UI is a
  two-step type-the-slug confirmation; deletions are structured-logged
  with the acting sysadmin's email.
- **New-forum email** fires from `POST /api/timetables` fire-and-forget
  (an email failure can never fail forum creation): recipients are
  SYSADMIN_EMAILS accounts with `newForumEmails: true`; body is forum
  name + feed link + owner name/email (`renderNewForum` in email.ts).
