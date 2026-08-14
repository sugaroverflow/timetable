# Personal API tokens: scoped, write-capable, GraphQL-only

**Date:** 2026-08-13
**Trigger:** The API page listed "Personal API tokens (read-only)" as planned,
so external clients had no usable credential. The only one available was the
Clerk session token, which expires after ~60 seconds and is refreshed in the
browser — a token pasted into a script's config is dead within a minute, and
the CORS allowlist (`env.webOrigin`) keeps browser clients on other origins off
`/graphql` entirely. The motivating case was a swipe-triage client that ❤️s,
comments, and marks topics seen.

## The model

- **`tpk_<43 chars base64url>`** — 32 bytes of `randomBytes`. Only the SHA-256
  hex lands in `api_token.token_hash` (unique); the plaintext exists once, in
  `createApiToken`'s return value, and is shown once by the UI. SHA-256 not
  bcrypt: authentication is a keyed lookup, not a compare, and the secret has no
  dictionary to slow down. `prefix` keeps the first 8 characters in cleartext so
  the UI can identify a row without holding anything that authenticates.
- **Scopes are opt-in per token** (`packages/shared/src/apiTokens.ts`):
  `hearts:write`, `comments:write`, `topics:write`, `calendar:write`,
  `feed:write`, `profile:write`. Reading needs no scope — reads are already
  role-filtered. Stored as `text[]`, not a pg enum array, because the list will
  grow and `ALTER TYPE … ADD VALUE` can't run in a Drizzle migration
  transaction. Unrecognised stored values are filtered on read
  (`normalizeScopes`), so removing a scope can never widen an existing token.
- **Enforcement is default-deny at the operation level**
  (`apps/api/src/graphql/token-scopes.ts`): one `onExecute` plugin maps root
  mutation fields to scopes and refuses anything unmapped. No resolver carries
  the check, and a mutation added later is denied to tokens until someone
  deliberately maps it. **The omissions are the security boundary** — moderation,
  publishing, forum settings, member management, timeslot admin, view-as
  preview, and `createApiToken`/`revokeApiToken` itself are unreachable by any
  token, whatever scopes it holds and whatever roles its owner has.
- **Scopes are a ceiling, never a grant.** `canHeart`, `assertMayComment`,
  `canModerate` all still run, so a token can only ever do a subset of what its
  owner could do in the app.

## GraphQL only — enforced in buildContext, not by convention

`restRouter` shares `buildContext`, and the scope plugin never sees a REST
request. So `buildContext` takes `allowApiToken`, and **only the Yoga context
callback passes `true`**. Without that flag the token is never even extracted,
and REST falls through to its existing 401.

Had REST accepted tokens, one scoped to nothing but `hearts:write` would have
reached `POST /api/forums/:id/invites`, `PATCH /api/memberships/:id/roles`,
`DELETE /api/memberships/:id`, `/api/uploads`, and the export — unscoped. Two
integration tests run the **real** `buildContext` against invites and role edits
to hold that shut; mocking it there would have tested nothing.

The token path also ignores `x-view-as`: a token always acts as its owner.

## Rate limits

- New `heart` action limit (60/min/user) — hearts had no throttle, and a script
  could otherwise churn toggles and their weighted-score recomputation. The
  existing per-user `comment`/`topic` limits already covered the rest; that
  module was written for exactly this case.
- The per-IP middleware takes a `clientKey` override: token traffic buckets on
  the token's hash instead of the IP, so one token can't multiply its budget
  across IPs and a shared NAT isn't starved by one member's script.

## Notes

- Token UI lives on the per-forum API page (`f/[slug]/api`), where people go
  looking, but tokens are **account-wide** — the copy says so, since the page
  isn't.
- The "Personal API tokens (read-only)" Planned bullet is gone; the MCP server
  bullet stays.
- Not done, deliberately: no CORS change (token clients are servers, CLIs, and
  extensions — a follow-up could allow token-authenticated requests from any
  origin, since a bearer token carries no CSRF risk), and no
  bootstrap-a-token-from-a-token flow.
- Gotcha worth knowing: run these tests via `npm run test --workspace
  @timetable/api`. A bare `npx vitest` from the repo root skips
  `apps/api/vitest.config.ts` and its single-`graphql`-copy alias, and every
  resolver error then masks to "Unexpected error." — the config comment already
  warned about it.
