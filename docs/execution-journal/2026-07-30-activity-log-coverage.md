# Activity log: coverage pass (launch QA)

Ed reviewed the activity-log action list and asked which events make sense.
Key realisation: the log **filter is data-driven** (`log/page.tsx` derives the
options from the actions actually present in the timeline), so there is no
static filter list to prune — every question reduces to *"should we log this
event?"*. It's also an **activity feed**, not a pure admin audit trail (it
already logs hearts, comments, first logins), which is why creation and
profile edits belong.

## Removed

- **`member.impersonate_end`** ("ended a member preview") — noise. The *start*
  (`member.impersonate`) is the audit event; the end is a guaranteed
  follow-up. `stopUserPreview` no longer logs (kept as a validated no-op the
  web still calls). Label retained for historical rows.

## Added / fixed logging

- **`topic.create`** ("created a topic") — a host creating their own topic
  was never logged; the lifecycle started at `topic.submit`. Logged in the
  `createTopic` mutation's self branch (admin-creates-on-behalf still logs
  `topic.reassign`, unchanged).
- **`comment.hide` / `comment.unhide`** — the `comment.hide` label + CSS
  existed but the moderation path **never actually logged it** (only dev
  seed did), so hiding a comment left no trace. Now logged in core
  `setCommentHidden`, mirroring `comment.add`'s topic+snippet payload;
  unhiding logs `comment.unhide`.
- **`member.role_change`** ("changed a member's roles") — promoting/demoting
  (admin/host/elector) had **no audit trail at all**. Logged in the REST
  `PATCH /memberships/:id/roles` handler, skipped when roles are unchanged;
  `note` records the new role set.
- **`member.profile_edit`** ("updated their profile") — a member editing
  their own name/bio/photo wasn't logged (only *admin*-edits-a-member-bio was,
  as `member.bio_edit`). Logged in `updateMyProfile`.
- **`topic.edit`** now logs **every** edit, including a host editing their own
  topic (was admin-edits-others-only via an `ownsTopicAsHost` guard).
- **`forum.settings`** / **`forum.privacy`** — settings changes weren't
  logged. `updateForumSettings` logs `forum.settings`; `updateForumProfile`
  logs `forum.privacy` (distinct, high-signal) when privacy actually changed,
  otherwise `forum.settings`.
- **`queue.finish`** ("finished the topic queue") — logged in `queueMarkSeen`
  when the Next that empties the round takes `remaining` to 0. (Finishing by
  hearting the last topic from the feed rather than pressing Next is not
  captured — "finished the queue" means going through it.)

Labels for all new actions added to `apps/web/src/lib/activityLabels.ts`.
Timeline suffix rendering needs no change: entries carrying `payload.topicId`
(+`title`) auto-link the topic via the existing `TopicSuffix`.
