# 2026-09-10 — Admins can deactivate a member

## The ask

Ed: "As an admin I'd like to be able to deactivate forum members. This
removes them from the people page and unpublishes their topics, but
leaves their comments." Then, mid-build: "it should pause their
notifications as well … their email digests, I mean." Asked what a
deactivated member can still DO, Ed chose **suspension**: roles treated
as empty, so they can't ❤️, comment or write topics, and on a private
forum can't read it.

## Why a new verb, not a softer Remove

"Remove from forum" deletes the membership row. The membership is the
per-forum profile — comment bylines and a topic's host card both
left-join to it — so removal turns every comment the person wrote into
an anonymous "Member" and orphans their topics. Deactivation keeps the
row and is reversible; that is the whole difference, and the Remove
confirmation now says so ("Their comments will lose their name. To keep
those, deactivate instead.").

## The change (`member-deactivation` in the glossary)

- **Schema** — `timetable_memberships.deactivated_at` (migration 0042,
  one additive nullable column — R11-safe). Null = active.
- **Suspension** — `getViewerRoles` returns `[]` when the stamp is set.
  It is the one place viewer roles are resolved (`ctx.getViewer` and
  `getReadableTimetable` both call it), so every permission check —
  reading a private forum included — sees a non-member. The stored
  `roles` column is untouched, so reactivation restores them exactly.
  `listMembershipsForUser` and `getLastVisitedTimetableSlug` skip
  deactivated rows: the forum leaves their switcher and landing
  redirect.
- **People** — `listPeople`/`getPerson` carry the stamp. `forumPeople`
  and `person` drop deactivated people for non-admin viewers; admins get
  them and the People page lists them in a dimmed **"Deactivated"**
  section at the foot (out of the role sections and the contents), each
  card leading with **Reactivate**. Their person page is admin-only and
  says so. The forum export mirrors this. `listTimetableHosts` (the
  admin host picker) excludes them.
- **Topics** — `deactivateMembership` unpublishes every currently
  `published` topic of theirs through `unpublishTopic`, so the log shows
  one `topic.unpublish` line per topic under the admin's name, then a
  `member.deactivate` line whose note carries the count. Drafts and
  already-unpublished topics are left alone. Reactivation republishes
  nothing — whether a topic that was live when they left should be live
  again is an editorial call, and Publish exists.
- **Digests** — `membershipIsEmailable` is false while deactivated, so
  the per-forum digest never builds for them. A filtered-out
  membership's send watermark never advances, so `reactivateMembership`
  stamps `lastDigestAt` to now: the first digest back covers what
  happened since they returned, not the whole absence. In-app
  notifications are untouched (they can't reach the pane anyway).
- **Guards** — `POST /api/memberships/:id/{deactivate,reactivate}`,
  admin-only via `requireAdminMembership`; the owner can't be
  deactivated, and neither can the acting admin (suspending your own
  roles would lock you out of undoing it). Integration tests cover the
  happy paths and all three refusals.
- **UI** — `PersonAdminPanel`: Deactivate (confirmation spells out the
  consequences, including how many topics come down) beside Remove in
  the editor; a deactivated card shows Reactivate without opening the
  editor. No invite button on a deactivated card. Log labels:
  "deactivated <Jane> (Host)" / "reactivated <Jane>".

## Edges worth knowing

- Add-person / invite-accept on an already-deactivated membership leaves
  it deactivated (`onConflictDoNothing` / role merge only) — an old
  invite link can't undo an admin's decision; the admin reactivates from
  People.
- A deactivated author's comments still wear their role pill (the
  comment join reads the row's roles). Cosmetic; left alone.
- Admin preview (`x-view-as`) of a deactivated member works and shows the
  empty-roles view, which is a fair picture of what they'd see.
- Not to be confused with the FORUM privacy value `deactivated`.
