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

From an automated review (Bugbot) of the working tree. Address these before
adding Phase 4 surface area.

### High

- [ ] **Archived hearts can be resurrected by toggling.**
  `packages/core/src/hearts.ts` — `toggleHeart` matches existing rows without
  considering `archivedAt`, so after `archiveTopicHearts` an elector can delete
  the archived row and re-insert an active one (and the plain insert risks a
  unique-constraint error if the existence check is changed naively). Fix:
  treat only active (`archivedAt IS NULL`) rows as "hearted", and use
  `onConflictDoUpdate` to reactivate cleanly. Decide policy: re-hearting after a
  reset is allowed (new vote) but must not silently delete the archive record.

- [ ] **Calendar omits default-yellow electors.**
  `packages/core/src/calendar.ts` — `buildCalendar` only aggregates electors
  who have an availability row, but the spec/schema default is **yellow**.
  Audience electors with no row should count as yellow in `counts` and appear in
  `perUser`.

### Medium

- [ ] **`hearted_topic` audience can leak across timetables.**
  `getAudienceElectorIds` doesn't verify the topic belongs to the current
  timetable. Join `topics` and filter `timetableId`.

- [ ] **Slot tagging accepts foreign topics.**
  `tagSlotTopic` doesn't check that the topic's `timetableId` matches the slot's.
  Validate before inserting (reject cross-timetable tags).

- [ ] **Pending invites aren't claimed for returning users.**
  `apps/api/src/auth/clerk.ts` only claims invites when creating a new local
  user. Invites created after a user's first sign-in are never claimed. Run
  `claimInvitesForUser` on each authenticated context build (cheap, idempotent),
  or on `myTimetables`. Optionally re-sync Clerk email/name.

- [ ] **Comments allowed on unpublished topics.**
  `addComment` checks membership but not topic status. Require `published` for
  public comments; allow host-only comments for hosts/admins on any status.

- [ ] **`submitTopic` has no lifecycle guard.**
  A direct call can move a `published` topic back to `submitted`. Only allow
  submit from `draft`/`unpublished`.

### Structural / hygiene (lower priority)

- [ ] `apps/web/next-env.d.ts` is tracked; Next regenerates it — consider
  gitignoring.
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
