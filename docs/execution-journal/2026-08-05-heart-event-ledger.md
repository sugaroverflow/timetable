# 2026-08-05 — Append-only ❤️/💙 event ledger

Ed: "I think it would be good to keep each heart event so that history can
be reconstructed." Context: the plan for Newspeak House is a **termly
reset** via the hearts cutoff — candidates re-vote each term with fresh
eyes. But the mutable heart tables destroy exactly the history that makes
term-over-term comparison possible: an un-heart deletes its row, and
post-cutoff revival (`toggleHeart`'s dead-vote dance) *overwrites* the old
`createdAt`. The data export is post-cutoff filtered too, so the moment the
cutoff moves, the previous term's picture was unrecoverable everywhere.

New `heart_events` table (migration 0029): append-only, one row per gesture
event — `kind` (`heart` | `host_heart`), `action` (`add` | `remove`),
denormalised `timetableId`, `createdAt`. Nothing in the app updates or
deletes rows. Both toggles (`toggleHeart`, `toggleHostHeart`) append via
`recordHeartEvent` alongside their existing activity-log write. The
migration backfills an `add` event from every live `hearts`/`host_hearts`
row, preserving timestamps, so current state seeds the history.

`hearts`/`host_hearts` remain the current-state tables — feed weights,
queue, analytics, and every read path are untouched. The ledger's one
consumer is the admin data export: a new admin-only `heartEvents` key
(oldest first), documented in the export README. It is deliberately
cutoff-agnostic, so past voting rounds can be reconstructed from it after
any number of resets.

Not done on purpose: no UI, no GraphQL surface, no retention policy, and
the activity log keeps its own heart entries (it's a moderation timeline
with titles and hidable rows, not a system of record). If per-term Analysis
windows ever ship, this table is what they'd read from.
