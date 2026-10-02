# 2026-09-25 — "Last activity" means any sign of activity

## The ask

Ed: "Analysis / Faculty Activity / Last Activity — what does this count? I
can see faculty that have 💙 recency but show no latest activity at all."

It counted only public contributions: a host's newest published topic
(publish or content edit) and their newest public comment on a published
topic since the hearts cutoff. 💙s were excluded on purpose — the code
said so, "so nothing about 💙 timing leaks to hosts" — because hosts can
see the Analysis tables too. Ed hadn't realised that, and decided: "I'd
like the 'last activity' to be any sign we have that they're active",
asked (multiple choice) whether hosts should keep seeing the table, chose
**everyone sees the full date**, then "same for electors".

## What was built — last-activity-signals

`loadLastActivitySignals(timetableId)` (`packages/core/src/lastActivity.ts`)
takes the newest timestamp per member over ten sources, each a grouped
`max`, run in parallel and merged in JS:

- **Acting:** `activity_events` by actor; the ❤️/💙 ledger `heart_events`
  (adds and removes); comments in any thread and slot-chat messages
  (posted or edited, hidden or deleted — the act still happened);
  availability and availability patterns; pencils/sessions they created.
- **Reading:** Topic Queue showings (`topic_seen`), threads read
  (`comment_seen`, which digest clicks also stamp), All Topics and
  notifications visits (membership watermarks).

Both tables fold it into their existing `latestActivityAt` (kept, so no
row can go older than before).

Choices I made without asking, stated to Ed:

- **Ledger, not `hearts`.** A cutoff revival bumps `hearts.createdAt`
  without the member doing anything; that would have made the whole forum
  look active the day an admin reset the term.
- **Not windowed** by the hearts cutoff: a blank for someone last seen in
  June is what Ed was complaining about. The count columns and the
  Active/Quiet filter keep their window.
- **View-as is safe:** every reading mark is written by a GraphQL
  mutation, and mutations are refused while previewing as a member.

No schema change. The queries are only exercised against a real database
on dev (no local Postgres on this machine).
