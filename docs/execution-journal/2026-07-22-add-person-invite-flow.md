## 2026-07-22 - Add-Person + Deferred Invite Email Flow

### Goal

Product feedback round 2 (issue #59): as a timetable admin, pre-create a
member's account, populate their profile and topics, and only then send
their invite email — so their first sign-in lands in an account with their
topics already there.

### Changes

- Migration 0017: nullable `invite_sent_at` on `timetable_memberships`
  (null = added but never invited).
- `packages/core/src/people.ts`: `createLocalUser` (local row for a
  just-created Clerk user; race-safe), `markInviteSent`, `getMembership`,
  `findUserByEmail`. Membership creation reuses the existing `inviteEmails`
  path (role merge, digest defaults, activity log) — once the local user
  row exists, the "existing user" branch attaches the membership instantly.
- `apps/api`:
  - `getOrCreateClerkUser` (auth/clerk.ts) — finds or silently creates the
    Clerk account; **Clerk sends nothing**, the invite email is ours.
  - `POST /api/timetables/:id/people` (admin) — Clerk user + local row +
    membership in one call; no email.
  - `POST /api/memberships/:id/invite` (admin) — renders + sends the invite
    via Resend (`renderInvite` in email.ts, includes the waiting-topics
    count), records `inviteSentAt`; also used for resends.
  - GraphQL: `Member.inviteSentAt`; `createTopic` gains admin-only `hostId`
    (target must hold host/admin role, mirroring `reassignTopic`), logging
    a `topic.reassign` event so the digest's "assigned to you" fires.
- `apps/web`:
  - People page (admins): `AddPersonForm` card; per-member invite state
    ("Not invited yet" / "Invited 12 Jul") + Send/Resend button.
  - My Topics: admins get an owner selector on the create form
    ("Me" + other hosts) via `timetableHosts`.
- Tests: 4 new API integration tests (403s for non-admins; add-person sends
  no email; invite-send emails the member and records `inviteSentAt`).

### Verification

Typecheck all workspaces, 36/36 API tests, lint, web build. End-to-end on a
review app: add person → create topic as them → send invite → sign in as
that email (OTP 424242) → topics present.
