# 2026-09-08 — Removing a topic's cover image actually removes it

## The report

Ed (QA): "Once a host has chosen a cover image for a topic, they should
also be able to remove it."

## What was wrong

The editor already had a "Remove image" button under the preview, and
the API already read an empty `coverImageUrl` as "clear the field". The
bug sat between them: `TopicEditForm`'s save turned an empty cover into
`null` before sending (`cover.trim() || null`), and across this API
`null` means "leave unchanged" — the three-state convention that lets a
mutation touch one field and not the others. So Remove image + Save
toasted "Topic updated" with the old picture still in place. The profile
editor already sent the trimmed string as-is; the topic forms didn't.

## The fix

- `TopicEditForm.tsx` and `CreateTopicForm.tsx` send `cover.trim()` —
  `""` when removed. (On create it was harmless either way; changed for
  consistency so the two forms can't drift again.)
- `app.integration.test.ts`: two `updateTopic` tests pin the convention
  — `""` reaches core as `null`, `null` reaches core as `undefined`.

## Not changed

Ed also asked whether a topic's author can delete their topic. They can
(My Topics, owner-only, draft/unpublished; published topics unpublish
first — launch QA 2026-07-29); he hadn't found it. Left as is.
