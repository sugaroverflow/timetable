## 2026-06-23T21:34:29Z - Dev Sample Seed Script

### Goal

Turn the completed dev sample data into a repeatable local database seed command
for issue #11.

### Changes

Added `npm run db:seed`, implemented `packages/db/src/seed-dev.ts`, and updated
the README quick-start flow to run `db:seed` after migrations. The seed reads
`dev-sample-data.md`, creates deterministic local users, creates the
`spt-test-data` timetable, and inserts memberships, topics, comments, hearts,
and activity events.

### Decisions

The script parses the Markdown fixture directly instead of requiring a separate
typed fixture. It validates missing people, topics, comment parents, roles,
topic statuses, comment visibility values, and invalid heart targets before it
opens a database transaction.

Reruns delete and recreate only the timetable with slug `spt-test-data`. Sample
users are upserted by deterministic local ids and are not deleted, so unrelated
local timetables and users are left alone.

### Tradeoffs

Timeslots, availability, and vote-ledger data remain out of scope because the
sample file explicitly says those are not modelled yet. Activity events are
derived from topic statuses and hidden comments so the activity page is useful
without inventing another fixture section.

### Risks

The Markdown parser expects the current fixture shape: field labels, topic
sections, comment bullets, and hearts table. It fails loudly for bad references,
but large structural edits to the fixture may require parser updates.

### Verification

Ran `npm run typecheck --workspace @timetable/db` and `npm run typecheck`.
Applied migrations, ran `npm run db:seed` twice, and checked Postgres counts:
one sample timetable, 87 topics, 35 comments, 364 hearts, and 73 activity
events.

### Demo Impact

A fresh local database now opens with realistic topic-feed, host-topic,
moderation, dashboard, settings, comments, hearts, and activity data for the
sample timetable. The documented owner dev user is `dev_sample_admin-edwin`.

### Customer-Facing Context

The seed is deterministic and does not call Clerk or external services. It keeps
fixture-backed demo data separate from production data and confines replacement
to one clearly named local sample timetable.

### Next Recommended Step

Add a second fixture section for timeslots, availability, and slot-topic tags so
the calendar and scheduling views can be demonstrated with the same fidelity as
the topic workflow.
