## 2026-07-22 - Admin Topic Controls on Every Surface (Ed, #59)

### Goal

Ed's #59 ask: the admin topic controls (Edit, Publish/Unpublish, Reassign
owner) existed only on feed TopicCards via `AdminTopicActions`. On the topic
spotlight page the Reassign select silently vanished (no `hosts` fetched),
the moderation queue offered only Publish + Edit, and My Topics showed
host-level controls even to admins. Admins should get the full set wherever
they see a topic.

### Changes

- Spotlight/permalink (`t/[slug]/[hostSlug]/[topicSlug]/page.tsx`): the page
  query now also selects `timetableHosts { id name }` (same field the feed
  query uses) and passes it through `TopicCard`'s existing `hosts` prop, so
  `AdminTopicActions` renders its Reassign select for admins.
- Moderation queue (`moderation/page.tsx` + `ModerationCard`): the card's
  bespoke Publish button + Edit toggle (and its private copy of the
  `moderateTopic` mutation, `useGqlAction`, and `TopicEditForm` state) are
  replaced by the shared `AdminTopicActions`. On a `submitted` topic it
  renders Edit, Publish (same `moderateTopic(action: "publish")` mutation as
  before), and Reassign — Unpublish never appears pre-publish because the
  component gates on `topic.status`. The page query now selects
  `timetableHosts` and `hostId` for the options/current-owner filter.
- My Topics (`topics/page.tsx` + `TopicManager`): the manage block moved into
  a `ManageControls` component (owns the `useGqlAction`/editing state). When
  the viewer is an admin it renders `AdminTopicActions` instead of the host
  row — the same precedence the feed's TopicCard applies (`isOwner &&
  !perms.canModerate` → host actions, else admin actions). Admins therefore
  see Publish (works from `unpublished` directly — `moderateTopic` has no
  status precondition) rather than "Submit for review". The page reuses the
  `timetableHosts` + `isAdmin(roles)` it already computed for the create-form
  owner selector.
- `lib/feedTypes.ts`: web `ManagedTopic` gains optional `hostId` (selected
  where a card shows the Reassign control, used as `currentHostId`).

### Audit-debt markers

`TopicManager`'s file-level `eslint-disable complexity` (18) is **deleted**:
extracting `ManageControls` and dropping the four now-unneeded prop defaults
(its single caller passes everything) brings it under the budget of 12. No
new markers; `TopicCard` / permalink page markers untouched.

### Not changed

`AdminTopicActions` itself is untouched — its status gating
(`published = status == null || status === "published"`) already renders
the right verb on every surface, so reuse beat extension everywhere.
