## 2026-07-22 - Web Decompositions: Audit-Debt Markers Cleared

### Goal

Final wave of the 2026-07-22 simplify audit's decomposition burn-down:
delete every remaining `audit debt (2026-07-22)` file-level eslint disable
in `apps/web` (plus the `apps/api` integration-test one) by decomposing the
offenders under the budgets (cognitive 15, cyclomatic 12, depth 4, 150
lines/function). Behavior-preserving: identical DOM output, identical
mutation payloads, zero test edits.

### Changes

- `components/SettingsForm.tsx` (complexity 47, the worst in the repo): the
  16 theme fields were enumerated by hand in five places (initial literal,
  ~16 `useState` calls, `currentState()`, `discard()`, JSX). Now one
  `useState<ThemeState>(initial)` + generic `setField`/`setThemeField`
  (the latter re-applies the live preview); `discard()` is
  `setState(initial)`; `currentState()` is gone; `toTheme()` unchanged so
  the saved `themeJson` payload shape/order is identical. Render split into
  `ColourGroup` (driven by `LIGHT_COLOUR_FIELDS`/`DARK_COLOUR_FIELDS`
  specs), `FontPicker`, `EmojiPicker`; initial state built by
  `initialLightFields`/`initialDarkFields`/`initialState`.
- `components/TimetableProfileForm.tsx`: state grouped into
  `identity`/`labels`/`digests` objects with `IdentityFields`/
  `RoleLabelFields`/`DigestFields` subcomponents. The two-sequential-
  mutations submit (settings ride in `useGqlAction`'s `onSuccess`, PR #97)
  is untouched.
- `components/TopicCard.tsx` (server component): extracted `TopicHead`,
  `HeartCommentRow`, `TopicTail` (breakdown/host-only/host/admin panels) in
  the same file; no `"use client"` added; `topicCardProps` flow intact.
- `components/MemberRolesEditor.tsx`: bio editor (lazy fetch + save) moved
  into a self-contained `BioEditor` subcomponent with its own state.
- `components/ElectorActivityTable.tsx`: the expandable hearts row is now
  `HeartsRow`.
- Pages (all extractions stay server-side): `t/[slug]/layout.tsx`
  (`loadPreview`, `loadSwitcherAndUnread`, `SideNav` on precomputed role
  flags); `activity/page.tsx` (`filterOptions`, `groupByWeekAndDay`,
  `ActivityToolbar`, `TimelineItem` + `ChipWrap`/`InvitedSuffix`/
  `TopicSuffix`); `calendar/page.tsx` (`buildIcsUrl`, `CalendarToolbar`,
  `CalendarEmpty`); `dashboard/page.tsx` (`normalizeFilters`,
  `sincePickerValue`, `ConflictsCard`, `HostLeaderboardCard`);
  `feed/page.tsx` (`HostFilterCard`, `FeedEmpty`); `people/page.tsx`
  (`PersonCard`/`PersonTopics`/`PersonCardActions`);
  `[hostSlug]/[topicSlug]/page.tsx` (`redirectIfStaleHost`, `StatusBadge`).
- `lib/timetableSettings.ts`: `themeVars` (complexity 25) composed from
  `accentVars`/`baseVars`/`fontVars`; spread order preserves the emitted
  key order that `buildThemeCss` serializes. Verified byte-identical
  against the old implementation over 7 sample themes (defaults, partial,
  dark-only, invalid hex, unknown font).
- `proxy.ts`: GraphQL round-trip extracted to `fetchDomainSlug`;
  `lookupDomainSlug` keeps the cache + catch. File stays in the
  architecture-rule ignores (infra exemption unchanged).
- `eslint.config.mjs` (root): test files (`**/*.test.ts`) are exempt from
  `max-lines-per-function` — long describe blocks are legitimate — which
  retires the `apps/api/src/app.integration.test.ts` marker. The web app's
  only test (transport.test.ts, 134 lines) is under budget, so no web
  exemption needed.
- `components/CommentList.tsx` (audit finding A5, partial): the duplicated
  host_only/admin_only pill JSX is now a `VISIBILITY_PILLS` lookup. The
  replies-ternary subcomponent extraction was skipped — it needs six
  threaded props for no structural win.

Notable: eslint's `complexity` rule counts every `??` and `?.` (+1 each),
which is why `initialState`-style default-fanout functions dominate the
audit list; the fix is destructure-once (`const dark = theme.dark ?? {}`)
rather than optional-chaining per field.

Remaining markers: five line-level disables in `apps/api/src/graphql/*`
(next pass). `apps/web` is at zero.

Verification: typecheck, lint (all budgets on, no disables), format:check,
vitest 62/62, `next build` all green; themeVars output-equality script; the
SettingsForm round-trip traced initial → edit → discard → save (same
`toTheme` shape, `discard` restores the same `initial` object the state was
seeded from).
