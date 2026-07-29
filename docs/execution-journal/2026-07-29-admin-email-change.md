# Admins can change a member's login email (never-signed-in guard)

**Date:** 2026-07-29

Ed's ask, built with one deliberate boundary: an email is a LOGIN
CREDENTIAL, global to the user across forums — so admins may only change
it while the member has NEVER signed in (Clerk `lastSignInAt` null).
That covers the real cases (pre-created accounts, invite typos, bounced
invites) while closing the account-takeover vector; after first sign-in
the address belongs to the member, who changes it themselves via
Account & security.

- `PATCH /api/memberships/:id/email` (admin-of-that-forum): Clerk gets
  the new address (verified + primary, old addresses removed), the local
  `users.email` mirror syncs, and the change is activity-logged
  (`member.email_change`). Signed-in member → 409 with an explanation;
  address-in-use → 502 with the provider's reason.
- UI: a "Login email" field in the People card's admin panel. The resend
  invite button then targets the corrected address.
