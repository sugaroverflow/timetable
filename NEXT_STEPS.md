# Audit & next steps

Snapshot taken at the Phases 0–3 milestone, with Phase 4 groundwork started.
This is the working plan for the **cleanup pass before Phase 4** and the
remaining **Phase 4** work.

## Current state

- Phases 0–3 are implemented and verified (auth, multi-tenant timetables/roles,
  topic feed + moderation, profiles/privacy, availability calendar).
- Auth is Clerk; `user.id` is the Clerk user id.
- Verification at snapshot: `typecheck`, `test`, `lint`, and `build` all pass.
- Phase 4 groundwork present: `packages/core/src/analytics.ts` and schema
  columns `users.lastDigestAt` / `users.icsToken` (migration `0005`), not yet
  wired to GraphQL/UI.

---

## Cleanup before Phase 4 (audit findings)

From an automated review (Bugbot) of the working tree. **All items below were
addressed** in commit `fix: address pre-Phase-4 audit findings`.

### High

- [x] **Archived hearts can be resurrected by toggling.**
  `packages/core/src/hearts.ts` — `toggleHeart` now treats only active
  (`archivedAt IS NULL`) rows as "hearted" and reactivates an archived row via
  `onConflictDoUpdate` (no silent loss / unique-constraint crash). Policy:
  re-hearting after a reset is a fresh vote.

- [x] **Calendar omits default-yellow electors.**
  `buildCalendar` now counts every audience elector, defaulting those without a
  saved row to **yellow** in `counts` and `perUser`.

### Medium

- [x] **`hearted_topic` audience could leak across timetables.**
  `getAudienceElectorIds` now joins `topics` and filters by `timetableId`.

- [x] **Slot tagging accepted foreign topics.**
  `tagSlotTopic` now rejects topics whose `timetableId` differs from the slot's.

- [x] **Pending invites weren't claimed for returning users.**
  `myTimetables` now runs `claimInvitesForUser` for the signed-in user.
  (Clerk email re-sync on each visit is still a possible enhancement.)

- [x] **Comments were allowed on unpublished topics.**
  `addComment` now requires a `published` topic for public comments; host-only
  comments remain available to hosts/admins on any status.

- [x] **`submitTopic` had no lifecycle guard.**
  Submitting is now allowed only from `draft`/`unpublished`.

### Structural / hygiene (lower priority)

- [x] `apps/web/next-env.d.ts` untracked + gitignored (Next regenerates it).
- [ ] N+1 reads worth revisiting at scale: `ManagedTopic.hostName`/`feedback`
  resolvers (per-topic lookups) and `buildFeed` (loads all timetable hearts per
  request). Consider dataloaders or a cached/materialized weighted score.
- [ ] Test coverage is thin (only weighted-heart math). Add unit tests for
  permission guards and the topic lifecycle state machine, plus an integration
  test per role.
- [ ] No rate limiting on mutations/REST. Add before public launch.

---

## Phase 4 — remaining work

- [ ] **Dashboard analytics** — GraphQL `dashboard(idOrSlug)` query over the
  existing `getDashboard` service; web dashboard page (host/admin) with topic
  status counts, weighted leaderboards, unallocated topics, and slot conflicts.
- [ ] **Slot conflict alerts** — surface multi-topic slots (a conflict badge in
  the calendar) and include them in the dashboard + (later) digests.
- [ ] **Daily digests** — compute per-user deltas since `lastDigestAt`
  (new topics, replies, host activity), a Resend-or-console sender, and a
  cron-secret-protected `POST /api/jobs/digests` endpoint; DO cron triggers it.
- [ ] **ICS export** — `GET /api/timetables/:idOrSlug/calendar.ics` (public, or
  per-user via `users.icsToken`); a "subscribe" link on the profile page. Also
  closes the deferred Phase 3 ICS item / calendar-sync evaluation.
- [ ] **Custom domains** — editable `customDomain` per timetable + hostname →
  timetable resolution; DO DNS/edge wiring documented in SETUP.md.
- [ ] **Multi-channel notifications** (optional) — WhatsApp/Matrix/webhooks via
  Novu or direct integration, only if required.

## Deferred (need credentials or a decision)

- DigitalOcean **Spaces uploads** (avatars, topic/timetable covers) — needs
  `SPACES_*` keys + bucket; images are URL-only today.
- **Cursor infinite scroll** — decided: paginate the `recent` sort with a
  `(published_at, id)` cursor.
- **Email/notification delivery** depends on `RESEND_API_KEY` (digests log to
  console in dev without it).
