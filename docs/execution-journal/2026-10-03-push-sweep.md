# 2026-10-03 — Web Push step 3: the once-a-minute sweep sender (#368)

Step 3 of `docs/web-push-plan.md` §6, PR #380, built on step 1 (#377,
tables and kind defaults) and step 2 (#378, `env.push`, `sendPush`,
`PUSH_PAUSED`). It ships inert: the timer starts only when `env.push` is
set (all three VAPID values present and valid), and while `PUSH_PAUSED`
it advances its window and sends nothing. With no keys anywhere today,
nothing changes for anyone. Step 2b (subscribe routes, device fields,
push kinds on the digest-settings mutation) was built in parallel and
none of its files were touched here.

## What was built

**`packages/core/src/pushEvents.ts`** — the database half.

- `claimPushSweepWindow()`: plan §3.2 step 1 in one short transaction.
  `pg_try_advisory_xact_lock(368000, 0)` (`PUSH_LOCK_NAMESPACE.sweep`);
  false → `busy`. Read `swept_until`; `to = date_trunc(ms, now() - 10 s)`;
  `from = greatest(swept_until, to - 10 min)`; `to <= from` → `empty`.
  `UPDATE … SET swept_until = to WHERE swept_until = <value read>`; zero
  rows → `raced`. The cursor is read as text and compared as text cast
  back to timestamptz, so the compare-and-set is exact to the microsecond
  (the migration's seeded `now()` carries microseconds a JS Date would
  round away, and the first claim would never match). Raw SQL carries
  timestamps as text only, never JS Dates (the Date-params gotcha).
- Event readers, one per family, each mirroring the digest or pane reader
  it names, event-first ("who did this happen to?") instead of
  person-first: topic comments (`commentActivities`, `replyActivities`,
  `mentionActivities`, `followedCommentActivities`; chain members are
  `loadChainScope` read backwards — a new child of P reaches P's author
  and every other child's author), Lounge posts (`listLoungeNotifications`
  and the digest card's footprint), `slot.*` events
  (`listSessionNotifications`), the `heart_events` ledger with
  `givenByActiveMember`, `topic.publish` / `topic.ready` /
  `topic.unready` (`newTopicActivities`, `pendingReviewActivities`,
  `unreadyActivities`), released slots (`loadSlotReleases`) and
  `member.first_login` (`loadNewMembers`). All are `gt`/`lte` range reads
  on `created_at`, run sequentially so the sweep holds at most one pool
  connection at a time, and only for people who have a device
  (`push_subscriptions`); the broadcast kinds look members up already
  narrowed to subscribers.
- `loadPushRecipientContext`: the recipients' memberships (roles,
  `deactivatedAt`, `digestSettings.push`, `loungeSeenAt`), their forums
  (slug, name, privacy, settings), their `comment_seen` marks, and how
  many forums each is active in.
- `listPushTargets`, `recordPushResults` (success: `failure_count = 0`,
  `last_sent_at = now`; gone: delete; failed: delete the rows this failure
  takes to 20, then bump the rest — deleting and updating one row in a
  single statement is undefined in Postgres, so the failure outcome is
  two statements).

**`packages/core/src/pushAudience.ts`** — the pure decisions, so every
rule is unit-tested without a database. `decidePushCandidate` applies, in
the plan's order: never your own action; an active membership (a
deactivated one is skipped, never unsubscribed); a forum you can read
(`canReadTimetable`, so private and deactivated forums); the thread's
visibility (`canReadPushThread`: drafting — the topic's host and admins;
{host}-only — `canSeeHostOnly`; an unpublished topic — its host and
admins); the Lounge gate (`canReadLounge`); the calendar for session and
slot kinds; the Push switch (`isPushKindEnabled` over
`digestSettings.push`) AND its audience (`digestKindApplies`) for any of
the switches the person qualifies through; and the thread not already
read past (`comment_seen` / `loungeSeenAt` at or after the event).
`buildPushPayload` words each kind with the shared helpers (`pushTitle`,
`pushBodyLine`) and links it the way the notifications pane does.

**`apps/api/src/push-sweep.ts`** — `sweepPush(deps)`: claim; if paused,
stop there (the cursor has moved, so unpausing releases nothing); read
the alerts; load the devices; `planDeviceSends` (newer than the device's
`created_at`, newest alert per thread tag, aimed-at-you first then newest,
at most 3 per device plus one "And n more [in {forum}]"); send through a
limiter of 4 with no database work in flight; record one outcome per
device (gone > failed > ok; a device found gone isn't sent to again in the
run). `rejected` counts as a failure (open call 2 of #378). Errors are
logged by name only, never message, since a database error can embed
parameters. `createPushSweeper` holds the in-process `running` flag;
`startPushSweepTimer` runs it every 60 s (unref'd) and its `stop()`
clears the timer and awaits an in-flight sweep.

**`apps/api/src/index.ts`** — the timer starts only when `env.push` is
set; the SIGTERM drain stops it at once and waits for the in-flight sweep
before `process.exit`, still under the existing 10 s backstop.

**Shared** — `canReadLounge(settings, viewer)` (`permissions.ts`): the
GraphQL `seesLounge` rule lifted so the resolver and the sweep share it,
as plan §1 asks; `graphql/activity.ts` now calls it.

## Tests

- `apps/api/src/push-sweep.test.ts` (36, in CI): every skip reason
  (own action, deactivated, removed, elector vs drafting thread, {host}-
  only, unpublished topic, Lounge closed/elector, deactivated forum,
  switch off/defaults/any-switch, audience, calendar off, read past,
  switch-less sent-back), every alert's wording and link, device created
  after the event, newest-per-tag, the 3 + overflow cap and its wording,
  urgency ordering, the busy/raced/empty claims doing nothing, paused
  claiming and sending nothing then reading only the next window, every
  outcome's bucket, the limiter peaking at exactly 4, an unsafe url
  skipped, overlapping ticks, a failed sweep logging no detail, and the
  timer's `stop()` awaiting the in-flight sweep.
- `apps/api/src/push-sweep.db.test.ts` (6, opt-in): the SQL against a
  migrated Postgres 16 — two claims racing never overlap, `busy` while
  another transaction holds the lock, the 10-minute cap and 10-second
  lag, the whole sweep over seeded data (host, chain reply, drafting
  thread @mentioning an elector, Lounge reply @mentioning an elector and
  a too-new device, a deactivated chain member), every other reader
  (session confirm, ❤️ ledger, publish, ready, admin unready, slot
  release, first login), gone deleting the row, the 20th failure
  deleting it, and success resetting the count. **Not run in CI**: CI's
  `npm run test` runs before `npm run db:migrate`, so its database has no
  tables then, and the api tests are otherwise database-free. Run with
  `PUSH_SWEEP_DB_TEST=1 DATABASE_URL=… npx vitest run
  src/push-sweep.db.test.ts` from `apps/api`; passed locally.

## Notes

- Session times are formatted in `Europe/London` (the digest schedule's
  clock), not UTC as the email's session lines are: an alert is read the
  moment it lands, so it should read in local time.
- `newMembers` alerts on `member.first_login` (as the digest does), not on
  the membership's creation: admins pre-create members with "Add person".
- No index was added: `comments`, `lounge_comments` and `timeslots` have
  no `created_at` index, so those range reads scan. At this cohort's size
  that is milliseconds a minute; an additive index is the fix if it grows.
