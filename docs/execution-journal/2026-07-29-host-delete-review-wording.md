# Hosts delete their own unpublished topics; "moderation" → "review" copy

Launch QA (Ed): "Hosts should be able to delete their topics if they're
not published yet. Hosts don't like the 'moderation' language of their
topics; can we make sure that's it's worded as 'review' everywhere that
that appears?"

## Host topic deletion

- `deleteTopic(topic, actorId)` in `packages/core/topics.ts` — a **hard
  delete**. Every topic FK cascades (comments, hearts, `topic_seen`, slot
  links — verified in `packages/db/schema`), so no soft-delete machinery
  is needed for a topic nobody but its host and the admins ever saw.
- Activity is logged **before** the row goes (`topic.delete`, payload
  jsonb carries id + title — no FK, so the log survives). Log page label:
  "deleted a topic".
- GraphQL `deleteTopic(topicId): Boolean` — gated on `ownsTopicAsHost`
  (owner-only: admins have reject/unpublish; this is the host's own bin)
  AND status ∈ {submitted, unpublished}. Published/archived topics refuse
  ("Only not-yet-published topics can be deleted") so nothing with public
  hearts/comments vanishes in one click — unpublish first.
- Web: red two-step confirm ("Delete" → "Yes, delete"/Cancel, same
  pattern as PersonAdminPanel's remove) in the My Topics manage row, shown
  only in the non-published states on the host path. Toast + refresh.
- Integration tests: owner+submitted deletes; published refuses;
  admin-non-owner refuses (masked-error gotcha: assert error presence +
  no write, not message text).

## Review wording

User-facing "moderation" copy is now "review"; internal identifiers
(`moderateTopic`, `moderationQueue`, `ModerationCard`, `canModerate`,
query name `Moderation`) deliberately keep their names.

- `/f/[slug]/log` empty-state hint: "Review and lifecycle actions will
  appear here."
- Forum profile role-labels helper: "Admin **reviews topics** and runs
  settings."
- API error string: "Invalid review action" (was "Invalid moderation
  action" — surfaces in admin toasts).
