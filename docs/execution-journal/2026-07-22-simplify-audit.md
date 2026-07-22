## 2026-07-22 - Repo-Wide Simplify Audit (Cross-Validated)

### Goal

Sweep the whole repo for reuse, simplification, efficiency, and altitude
problems before the beta launch — and separate real findings from plausible
guesses by cross-validating two independent methods: four semantic review
agents (one per lens: reuse / simplification / efficiency / altitude) against
a static census (knip + depcheck + an ESLint complexity pass). Only items
confirmed by at least two methods (plus manual grep) were acted on.

### Fixed immediately (PR #84)

Dead code, all double-confirmed:

- `canTransferOwnership` (shared/permissions) — no transfer-ownership feature
  exists; its `isOwner` import went with it.
- `topicWeightedScore`/`topicWeightedBreakdown`/`WeightedHeart`
  (shared/hearts) — orphan-tested legacy; production uses `topicNormScores`
  and core's `getWeightedBreakdown`. (The GraphQL `topicWeightedBreakdown`
  field is separate and live.)
- `themeStyle` (web timetableSettings) — superseded by `buildThemeCss`.
- `useDepthLimit` (api) — superseded by `useOperationLimits`.
- Stale activity labels `topic.request_changes` and `hearts.archive`;
  `ToolButton`'s never-read `editor`/`style` props; un-exported internals
  (`isTopicNew`, `uploadPurposes`, `Impersonation`, `CommentVisibility`).
- Dependency hygiene: removed unused `@eslint/eslintrc` (web); declared
  actually-used `vitest` (api) and `@eslint/js` + `globals` (root).

### Queued fix batches (not done yet)

- **Filter components** — ~10 near-identical dropdown/filter components
  consolidate into a shared primitive (in flight).
- **Mutation-toast-refresh choreography** — the same mutate → toast →
  `router.refresh()` dance is hand-rolled in ~21 client components;
  consolidating into one helper (in flight).
- **Feed-page efficiency** — rendering the feed as an admin costs on the
  order of 120 DB queries; queued: lazy breakdown loading, batched comment
  fetching, per-request memoisation.
- **Complexity hotspots** for decomposition: `getDashboard`
  (~330 lines, `packages/core/src/analytics.ts`), `SettingsForm`
  (16 fields handled in 5 places), `computeUserDigest`
  (`packages/core/src/digests.ts`).

### Confirmed keepers

Flagged by one method, cleared on cross-check — do not "simplify" these:

- the database-backed rate limiter (needed across App Platform instances)
- the markdown-it + sanitize-html rendering pipeline
- `sidebarStore` (the drawer/sidebar state seam)

### Verification

Post-deletion: lint 0, format:check clean, typecheck 0, 56/56 tests.
