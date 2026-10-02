# Dead-code sweep from the pre-prod audit

**Date:** 2026-08-17
**Trigger:** the pre-prod audit's dead-code list — symbols exported but
imported nowhere, over-fetched GraphQL fields, phantom CSS class tokens,
and one orphaned script. Every item was verified dead by a repo-wide
search before removal; anything a test imports was left exported.

## Changes

- **Orphaned script:** deleted `scripts/qa-invite-flow.mjs` (a one-off QA
  driver; it was also the only consumer of an undeclared `playwright-core`
  dependency).
- **Un-exported internal-only symbols** (kept, no longer exported):
  `formatTime` / `monthLabel` / `weekKey` in
  `apps/web/src/components/CalendarTable.tsx` (only used in-file since the
  calendar-row unification; `formatDate` there was already private),
  `loadPublishedHostHearts` (`packages/core/src/hostHearts.ts`),
  `digestCommentTopicIds` (`packages/core/src/digests.ts`),
  `isAuthenticated` (`packages/shared/src/permissions.ts`, 8 internal
  uses), `stableUuid` (`packages/db/src/seed-dev.ts`),
  and `AVATAR_SLOT_COUNT` (`packages/shared/src/display.ts`).
  `ELECTOR_ACTIVITY_FILTERS` (`packages/core/src/analytics.ts`) stays
  exported: un-exported it trips `no-unused-vars` (its only use is
  deriving `ElectorActivityFilter`, and the rule doesn't count type-only
  uses of a value) — export is the quietest way to keep the const.
- **Dead types:** in `packages/shared/src/validation.ts`, deleted
  `updateProfileSchema` + `UpdateProfileInput` outright and the unused
  `z.infer` aliases `InviteInput`, `UpdateMemberEmailInput`,
  `AddPersonInput`, `UpdateMemberRolesInput`, `CreateApiTokenInput`,
  `CalendarSettingsInput` (their schemas all stay — the API validates
  with the schemas directly). In `packages/db/src/schema/index.ts`,
  deleted the unused inferred row types `TimetableInvite`,
  `NewTimetableInvite`, `AvailabilityPattern`, `ApiRateLimitBucket`,
  `NewApiRateLimitBucket` (`NewAvailabilityPattern` is used by the seed
  and stays).
- **Over-fetched GraphQL fields:** `TOPIC_FEED_FIELDS` no longer selects
  `weightedScore` (queried but never rendered — the analysis page has its
  own leaderboard query) and `CALENDAR_SLOT_FIELDS` no longer selects
  `cellKey` (never read client-side). Mirroring TS types updated
  (`feedTypes.ts`, `calendarTypes.ts`); the API fields themselves are
  untouched. Also fixed the stale fragment comment referencing the
  deleted `BreakdownToggle` (the live pieces are
  `BreakdownPanel`/`BreakdownCaret`).
- **Unused imports:** dropped `canConfirmSession`, `canDiscussSlots`,
  `canProposeSession`, `isElector`, `type Viewer` from the calendar
  page's `@timetable/shared` import, and the whole unused
  `calendarTypes` type import in `SlotDiscussion.tsx`.
- **Rename:** `HostOnlyPanel.tsx` → `HostOnlyThreadBody.tsx` (`git mv`) —
  the collapsible HostOnlyPanel wrapper died on 2026-08-14 and
  `HostOnlyThreadBody` is the file's only export; imports in
  `TopicCard.tsx` and `MyTopicsTabs.tsx` updated.
- **Phantom class tokens:** removed `sortable-table` from
  `BreakdownTable.tsx`, `ElectorActivityTable.tsx` (2 sites), and
  `HostActivityTable.tsx`, and `admin-panel` from
  `AdminCommentsPanel.tsx` — no CSS rule anywhere matches either token.

## Explicitly left alone

`packages/core/src/export.ts` (concurrent security PR), all CSS/token
files (concurrent CSS PR), the seed-dev "draft"→"submitted" compat shim,
`CollapsibleTopicBody.tsx`, the Drizzle `*Relations` exports, and the
`availabilityCount`/`slotCount` GraphQL fields.
