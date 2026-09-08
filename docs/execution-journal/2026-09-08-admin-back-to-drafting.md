# 2026-09-08 — Admins can send a "ready to publish" topic back to drafting

## The ask

Ed: "As an admin, I should be able to set topics in my pending topics
back to 'draft' from 'ready to publish'."

## What existed

The `setTopicReady` mutation already admitted admins (`canEditTopic`,
with an integration test for the admin path since 2026-08-06), but the
only control that called it was the host's `ReadySwitch` on My Topics.
The Pending Topics card showed the readiness only as a badge.

## The change

`BackToDraftingButton` in `AdminTopicActions.tsx`: a ghost button in the
admin action bar, rendered only for a draft (`submitted`) topic whose
host has marked it ready. It clears `readyAt`, toasts "Moved back to
drafting", and the refresh drops the card out of the Pending page's
default ready view. Activity-logged as `topic.unready` like the host's
own flip.

One-way on purpose: "ready" is the host's word, the admin's is "not
yet". Feedback on why still goes in the drafting thread, as before.
Feed cards don't pass `readyAt`, so the button never shows there.
