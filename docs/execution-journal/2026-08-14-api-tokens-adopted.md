# Personal API tokens adopted from #273, with a hardening pass

**Date:** 2026-08-14
**Trigger:** External contributor mstem (Matt) submitted personal API tokens
as PR #273 — the first outside security-sensitive contribution. Review found
the architecture sound (hash-at-rest `tpk_` bearer tokens, default-deny
mutation scope map in an `onExecute` plugin, GraphQL-only via
`buildContext`'s `allowApiToken` flag, immediate revocation) but flagged
required fixes. Decision: adopt the PR with Matt's commits and attribution
preserved, apply the fixes on top, keep write capability with automated-write
rate limits, keep account-wide tokens for now. Matt's design record is
`2026-08-13-personal-api-tokens.md`; where this entry contradicts it (rate
limiting), this entry describes what merged.

## The blocker: rate-limit bypass via fake tokens

Matt's per-IP middleware took a `clientKey` override that bucketed
`Bearer tpk_…` traffic by `token:sha256(bearer)` — computed BEFORE any
validation, since `extractApiToken` only checks the prefix. A different
random `tpk_` string per request therefore minted a fresh bucket every time
and never accumulated against any limit — a total bypass of the global rate
limit for anyone, unauthenticated — and on the database backend every fake
string INSERTed a bucket row (unbounded table growth).

Fix: the pre-auth middleware buckets **strictly by IP** again (`clientKey` is
gone from `rate-limit.ts` — a comment now warns against ever keying by
client-controlled input there). The feature's legitimate goal — one real
token can't multiply its budget by spreading across IPs — moved to the far
side of authentication: `getUserFromApiToken` charges a per-token request
budget (same size as one IP's budget, `env.rateLimitMax` per window, keyed by
the token's **row id**) only after the hash lookup succeeds. Unverified
strings burn their sender's IP budget and touch no token bucket. Over-budget
is an explicit `RATE_LIMITED` GraphQLError, not a null — a null would demote
the request to anonymous and still run it.

## The rest of the hardening pass

- **Mint cap** — `createApiToken` is action-limited (10/hour/user, new
  `tokenMint` entry in `ACTION_LIMITS`) and refuses beyond 25 ACTIVE
  (unrevoked, unexpired) tokens per user (`MAX_ACTIVE_TOKENS_PER_USER` in
  shared, `countActiveApiTokens` in core). `listApiTokens` is bounded at 200
  newest — always the whole active set plus generous revoked history.
- **Expiry default, server-side** — an omitted `expiresInDays` now defaults
  to 90 days at the API layer (`DEFAULT_TOKEN_EXPIRY_DAYS`); "never expires"
  requires an EXPLICIT `expiresInDays: null`. The UI already defaulted to 90
  days and still offers "No expiry" as a deliberate choice.
- **Scope-map gap** — `markCommentsSeen` and `markDigestRead` joined
  `feed:write`: a feed-triage token that can't mark comment threads seen
  leaves its owner receiving digests for comments already read (digests
  suppress against `comment_seen`, not page watermarks).
- **Automated-write budgets (Ed's decision)** — per-token write limits,
  enforced ONLY for token-authenticated requests in a second `onExecute`
  plugin (`useApiTokenWriteLimits`, registered after the scope plugin so it
  only ever meters allowed fields). Two windows per action class, because
  real organic volume is tiny (a host writes ~30 topics a YEAR): an hourly
  burst limit AND a daily volume cap. Topic creation 10/hour · 20/day, new
  comments (`addComment`/`addSlotComment`) 20/hour · 60/day, ❤️ toggles
  60/hour · 100/day (deliberately tighter than the per-user 60/min heart
  action limit Matt added — for tokens only), every other mapped write
  60/hour · 200/day as one shared bucket. Both windows charge on every
  attempt, so burst-blocked retries still spend the day. All tunable in one
  place: `TOKEN_WRITE_LIMITS` in `token-scopes.ts`, next to the scope map.
  Error copy: "Rate limit for automated writes reached — try later."
  Session users are untouched; token requests remain ALSO subject to the
  per-user action limits, keyed by owner.
- **Migration renumber** — Matt's `0038_personal_api_tokens` became **0039**
  (file, snapshot, `_journal.json` idx/tag): `feat/confirm-time-locations`
  claims 0038 and merges first.
- **Web polish** — the API page no longer fires `myApiTokens` for signed-out
  visitors nor swallows real errors into "Sign in to create a token"
  (`auth()` gate). Left alone deliberately: the native `confirm()` on revoke
  (repo precedent — `CommentActions`, `SlotDiscussion`,
  `SlotSessionControls` all use `confirm()`; no Base UI destructive-confirm
  component exists to reuse) and the panel's numeric fontSize/gap literals
  (`tokens.css` has no font-size scale, and inline numeric gaps are the
  established idiom in neighboring components).

## Tests

Matt's suites kept green and extended: budget-after-auth unit tests
(`api-token.test.ts` — blocks when spent, keys by row id, charges nothing for
failed auth), write-limit plugin tests (`token-scopes.test.ts` — per-bucket
budgets, shared `other` pool, per-token independence, session exemption),
mint-cap/expiry integration tests (`app.integration.test.ts` — 90-day
default, explicit-null "never", 26th-token refusal, 10/hour mint limit), and
the `feed:write` additions.
