## 2026-07-22 - GraphQL Schema Domain Split (Identical Schema Output)

### Goal

The long-queued decomposition from the 2026-07-22 audit: `apps/api/src/
graphql/schema.ts` was ~2,250 lines — one Pothos builder, ~20 object types,
and monolithic `queryType`/`mutationType` blocks — carrying a blanket
file-level lint disable. Split it by domain with **zero logic changes**,
using the additive `queryFields`/`mutationFields` pattern the file's
slots/dashboard tail already proved out.

### Layout

`apps/api/src/graphql/` now holds:

- `builder.ts` — the shared `SchemaBuilder` instance plus empty root
  `queryType({})`/`mutationType({})`; every field is registered additively.
- `guards.ts` — the shared guard ladder from PR #87 (`requireUser`,
  `readTimetable`, `loadTimetableAndViewer`, `requireAdminTimetable`,
  `loadTopicAndViewer`, `loadSlotAndViewer`, `assertCanOwnTopic`), the four
  error helpers, the argument parsers (`parseAudience`,
  `parseElectorActivityFilter`), and the theme validators (`colour`,
  `parseThemeJson`).
- `types.ts` — only the object types referenced by more than one domain:
  `Timetable`, `Comment` (with its self-referential `replies` objectRef),
  `WeightedHeart`, `SlotTag`. Single-domain types live with their domain
  (e.g. `User`/`Person`/`Member` in members, `Topic`/`ManagedTopic` in
  topics, the Dashboard family in dashboard).
- Domain modules, each self-registering on the builder: `topics.ts`,
  `comments.ts`, `members.ts`, `timetables.ts`, `activity.ts`, `slots.ts`,
  `dashboard.ts`.
- `schema.ts` — the assembly point: side-effect imports of the domain
  modules in a fixed order, then `export const schema = builder.toSchema()`
  (same export as before; `app.ts` untouched).

Resolver bodies, field definitions, and doc comments moved verbatim. The
only structural liberty: large field groups register via more than one
`queryFields`/`mutationFields` call per file to stay under the
`max-lines-per-function` budget.

### Verification

- **Schema snapshot diff** — new `scripts/print-schema.mjs` (run with
  `node --import tsx scripts/print-schema.mjs`) prints
  `printSchema(lexicographicSortSchema(schema))`. Captured on the base
  commit and after the split: the diff is **empty** (338 lines of SDL,
  byte-identical).
- 36/36 api vitest tests pass with zero test edits; full
  build/typecheck/lint/format:check green.
- The blanket `eslint-disable complexity, max-lines-per-function,
  sonarjs/cognitive-complexity` marker at the top of the old schema.ts is
  gone. Five inherited hotspot resolvers keep line-level disables naming
  only the rule they exceed (all tagged audit debt for the decomposition
  burn-down): `addComment` and `replyToComment` (visibility-permission
  ladders), `updateTimetableSettings` (13-arg settings patch), `topicFeed`
  and `topicPermalink` (complexity 13/16).
