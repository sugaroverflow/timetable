# 2026-08-03 — No digest emails before the invite

Ed: "users that have not been sent invites yet shouldn't get email
notifications." Admins pre-create accounts ("Add person"), populate their
profile and topics, and only later press Send invite — but the digest cron
selected recipients purely by membership + digest settings (which
`digestDefaults` seeds on creation), so a pre-created member could receive
forum-activity digests before the forum's first deliberate contact.

Fix in `computeUserForumDigests` (via `loadDigestContext`): a membership is
**emailable** when any of `inviteSentAt`, `lastSeenFeedAt`, or
`lastSeenNotificationsAt` is set. Non-emailable memberships are filtered
out of the digest context entirely, so the forum contributes no cards, no
availability asks, and no elector/calendar scope for that recipient.

Why this signal set (and not `inviteSentAt` alone): `inviteSentAt` is null
for organic members too — forum creators and pending-invite claimants never
get a membership-invite email. But organic members always reach the app
(the feed/notifications watermarks), so either watermark also unlocks
email. Per-forum on purpose: a user active in forum B but silently added to
forum A gets no A-emails until A invites them or they visit A. No Clerk
API calls, no migration — all three columns already exist.

The digest is the only bulk email; the invite email itself, the admin's
test digest, and the sysadmin new-forum notice are all explicit sends.
