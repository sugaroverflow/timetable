# 2026-07-25 - Per-Forum Profiles (name, photo, bio, slug)

## What happened

Ed's launch-QA decision: member identity is **forum-scoped**. Name, photo,
bio, and URL slug now live on `timetable_memberships`; the `users` row keeps
only account data (email, auth, notification settings, and the Clerk-synced
name/image used as defaults when a membership is created). Slugs went from
globally unique to unique per forum — cleaner URLs, no cross-tenant
namespace leaks, and editable-slug decisions become per-forum.

## Schema

Migration 0018: adds `name/image/bio/slug` to `timetable_memberships`,
backfills from `users` (old slugs were globally unique so the per-forum
copies are automatically unique), then creates the
`(timetable_id, slug)` unique index. `users.slug`/`users.bio` are now
unused (left in place; drop later).

## Code changes

- `ensureUserSlug`/`getOrCreateUserSlug` → `ensureMemberSlug(timetableId,…)`
  (same reserved-segment list). `updateUserProfile` → `updateMemberProfile`.
- Every membership-creation path goes through `createMembershipWithProfile`
  (invite-by-email, invite acceptance, forum creation, dev seed), which
  seeds the profile from account defaults and assigns the slug.
- All display reads switched from `users` joins to membership joins scoped
  by the relevant timetableId: topics feed, weighted breakdown, comments
  (incl. @mention resolution), notifications, activity log, calendar/slot
  comments, digests, analytics, People/person queries. Joins are LEFT so
  content survives its author leaving the forum (renders null name).
- GraphQL: `person(idOrSlug)` with no user args now returns the viewer's
  own membership profile (powers the profile editor); `updateMyProfile`
  takes `idOrSlug` and returns Person.
- Web: `/t/[slug]/profile` edits that forum's profile; standalone
  `/profile` is account-only (email, appearance, digests).

## Consequences to remember

- Renaming yourself in forum A no longer changes anything in forum B.
- Clerk profile changes no longer propagate to existing memberships —
  account name/image are only copy-on-create defaults.
- The invite email now uses per-forum names for invitee and inviter.
