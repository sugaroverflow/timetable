# 2026-08-03 — Role pills on commenters, person-links everywhere

Ed: in threads where hosts and electors mix, show each commenter's role;
and every avatar or username anywhere should click through to the
person's page. Plus an invited pass over comment-system debt.

## Role pills

- API: `Comment.authorRoles` and `SlotComment.authorRoles` (the author's
  membership roles in the topic's/slot's forum, from the same left join
  that supplies name/image; `[]` for ex-members and tombstones).
- Web: new `PrimaryRolePill` in `RolePills.tsx` — the author's single
  highest role (shared `primaryRole` from @timetable/shared) as the 10px
  pill the activity log already used; the log now renders the shared
  component. One pill, not the full role set — a Dean+Faculty+Candidate
  row would drown the name.
- Rendered in every thread: topic cards (public + host-only + drafting
  panels), My Topics, Pending, permalink, and calendar slot discussions.
  Labels are the forum's own: `TopicCard` reshapes its existing
  hostLabel/adminLabel/electorLabel props into a `RoleLabels`;
  TopicManager/ModerationCard gained an `electorLabel` prop; the calendar
  page threads `settings.roleLabels` down to the fold.

## Person-links

Wrapped the remaining unlinked avatars/names (PersonChip or `personPath`
links): comment avatars (names were already linked), notification author
names (avatar was), ModerationCard header (neither was), People page
photo + name (name used to link to the filtered feed, and only when the
member had topics — both now go to the person page always),
ElectorActivityTable rows and their hearted-topics host column,
HostActivityTable and TopicLeaderboard avatars.

## Refactor (queued audit debt, 2026-07-22)

`graphql/comments.ts`: the per-visibility permission ladder — duplicated
in addComment/replyToComment behind `eslint-disable complexity` — is now
one `assertMayComment`; the four hand-assembled mutation payloads are one
`commentNode` builder (which also resolves authorRoles; the web client
only selects `id` and refreshes). Both disables are gone. hideComment/
editComment payload roles come from a `getViewerRoles` lookup; editing
deliberately skips the topic guards it never needed.
