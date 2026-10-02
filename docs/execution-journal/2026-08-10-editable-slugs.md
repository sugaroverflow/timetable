# 2026-08-10 — Editable forum slugs, old URLs redirect forever

Backlog item 13. Forum Settings' "URL: /f/x (set at creation)" note
becomes an editable slug field; every slug a forum has ever had keeps
working.

- **`timetable_slug_history`** (migration 0032, additive): old slugs,
  globally unique. A slug in history is **reserved** — `slugTaken`
  refuses it for other forums at creation (`uniqueSlug`) and rename
  (`updateTimetableSlug`), so a link in a sent email can never start
  pointing at someone else's forum. A forum reclaiming its own old slug
  deletes the history row (transactional with the rename).
- **Resolution**: `getReadableTimetable` falls back to a history join on
  slug miss — GraphQL `idOrSlug`, REST paths, and ICS/Atom URLs in
  calendar apps all funnel through it, so everything keeps resolving
  under old slugs with zero per-callsite changes.
- **Redirects**: the web proxy 308s `/f/<old>/…` to the canonical slug,
  via new anonymous query `forumCanonicalSlug(slug:)` (privacy ignored —
  only the mapping is exposed, same trade as `forumRouteByDomain`) with
  the same 60s cache as the custom-domain lookup. Lookup failure = no
  redirect, page still renders via the API fallback.
- **Mutation**: `updateForumProfile` gains `slug`; format enforced by
  shared `forumSlugSchema` (extracted from `createTimetableSchema`),
  availability by core; "taken" surfaces as a readable error; renames
  log `forum.slug` with `/f/old → /f/new`.
- **UI**: slug input in Forum Profile (client-side lowercased/stripped),
  reassurance copy appears only when edited; after a rename the form
  hard-navigates to the new settings URL.

## Test-infra find: vitest masked every resolver GraphQLError

The "already taken" message assertion exposed it: under vitest, Vite's
ESM/CJS interop loads **two copies of graphql-16** — resolver-thrown
`GraphQLError`s fail Yoga's cross-copy `instanceof` and get masked to
"Unexpected error.", so error-message assertions could never pass (and
error paths could silently regress). Test-only artifact — Node resolves
one copy in production. Fixed with a `graphql` resolve alias in a new
`apps/api/vitest.config.ts`; error messages in tests are now real.
