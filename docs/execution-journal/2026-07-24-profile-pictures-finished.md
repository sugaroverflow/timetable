# 2026-07-24 - Profile Pictures Actually Rendered + Admin Photo Editing

## Goal

Production-QA round 2: uploaded profile pictures were never displayed
anywhere (avatars always rendered initials), admins couldn't set a member's
picture when editing their bio, and profile images couldn't be removed once
set.

## Changes

- `Avatar` gains an `image` prop — renders a round `<img>` (object-fit
  cover) with the initials span as fallback. New `.avatar-img` rule.
- Passed images at every call site whose payload already carried them
  (the plumbing existed end-to-end but was never rendered): TopicCard
  (`hostImage`), CommentList (`authorImage`), PersonChip modal
  (`person.image`, already fetched!), Activity page (`actorImage`).
- Added `image` to selections that lacked it: People page, feed
  host-filter card.
- Extended payloads that had no image at all — each a `users.image` join
  already available at the query site:
  - notifications: core `listNotifications` + `Notification` GraphQL type
    + notifications page;
  - slot comments: core `listSlotComments` + `SlotComment` type +
    SlotDiscussion;
  - weighted-heart breakdown: core `WeightedHeartEntry` +
    `WeightedHeart` type + BreakdownToggle/BreakdownTable;
  - `ManagedTopic.hostImage` resolver (same `getUserById` pattern as
    `hostName`) + ModerationCard.
- `updateMemberBio` mutation gains an optional `image` arg (omit = leave,
  `""` = clear); the admin "Edit bio" panel is now "Edit bio & photo" with
  an ImageUploadField (purpose `profile-image` needs no timetable role).
- ProfileForm: sends `""` instead of `null` for a cleared image (the API
  reads null as "leave unchanged" — same bug class as the cover/icon fix
  in #103), plus label/hint cleanup.

All GraphQL changes are additive (new nullable fields / optional arg) —
no breaking schema changes, no migrations.
