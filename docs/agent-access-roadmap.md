# Agent-access roadmap & MCP server plan

Forward-looking plan (MCP server not yet built). Written 2026-07-30;
refreshed 2026-10-02. Owner: Ed.
This is the design home for the "MCP server" item still listed as
**Planned** on the per-forum API page
(`apps/web/src/app/(app)/f/[slug]/api/page.tsx`). Personal API tokens,
the other item it was written for, shipped 2026-08-13.

## Where we are

The agent-access roadmap has numbered phases:

1. **Atom feed — SHIPPED** (2026-07-27). `/api/forums/:slug/feed.atom`, newest
   50 published topics, anonymous-only (private forums 404). See
   `docs/execution-journal/2026-07-27-atom-feed.md`.
2. **Personal API tokens — SHIPPED** (2026-08-13), and write-capable, not
   read-only as planned here. See
   `docs/execution-journal/2026-08-13-personal-api-tokens.md`.
3. **MCP server — NOT BUILT, no code.** Still only a one-line "Planned"
   mention ("An MCP server.") on the API page.

Non-browser clients now authenticate with a **personal API token**:
`tpk_…`, sent as `Authorization: Bearer tpk_…`, stored only as a SHA-256
hash (`api_token.token_hash`), shown once, revocable, expiring (90 days by
default), and **account-wide** (it carries the owner's roles in every forum).
Tokens are **GraphQL-only** — `buildContext` extracts them only for the Yoga
context, so REST (export, uploads, invites, feeds) refuses them
(`apps/api/src/auth/api-token.ts`, `apps/api/src/context.ts`). The Clerk
session JWT and the calendar `icsToken` (`packages/core/src/profile.ts`)
remain as before.

## Product constraints an MCP server inherits (non-negotiable)

- **Role-filtered through existing permission checks** — never a parallel
  data path. Reads return "exactly what the viewer's role can already see
  in the app" (`api/page.tsx`) and need no scope.
- **Writes are opt-in per token.** Scopes (`hearts:write`,
  `comments:write`, `topics:write`, `calendar:write`, `feed:write`,
  `profile:write` — `packages/shared/src/apiTokens.ts`) are a ceiling,
  never a grant; unmapped mutations are denied to every token
  (`apps/api/src/graphql/token-scopes.ts`), so moderation, publishing,
  forum settings, member management and token administration stay
  session-only. (The original "read-only first" constraint described the
  tokens as planned; the shipped tokens can write.)
- **No email addresses** in the surface. (Timeslot data is no longer
  excluded: the calendar shipped and the export now carries it,
  role-filtered.)
- **Public names say `forum`** (frozen for third parties, see `CLAUDE.md`);
  MCP tool/resource names must use forum/topic/etc.
- **Factual, access-description tone**; the API page stays the single home
  for machine-access copy (no starter prompts, no email).

## The latest MCP spec: 2026-07-28

Re-check against the current MCP specification before building; this summary is as of 2026-07-30.

Released 2026-07-28 (a major, breaking overhaul). Because we have **no MCP
code**, we build straight onto the modern model and skip the migration others
face. Relevant points:

- **Stateless core** — no `initialize` handshake, no protocol-level sessions,
  no `Mcp-Session-Id`. Each request self-describes (protocol version +
  capabilities in `_meta`); new `server/discover` RPC. Maps 1:1 onto our
  stateless Express API — the single biggest reason to target this revision.
- **Streamable HTTP** is the remote transport (HTTP+SSE now deprecated).
  stdio is irrelevant to a hosted multi-tenant app.
- **Cacheable list results** (`ttlMs`, `cacheScope: public|private`) — fits
  forum data: public forums `public`, member-scoped `private`. Deterministic
  tool ordering improves prompt-cache hits.
- **Auth aligned with OAuth/OIDC**; Dynamic Client Registration deprecated in
  favor of Client ID Metadata Documents; `iss` validation required.
- **Do NOT adopt** (deprecated / optional): Roots, Sampling, Logging,
  HTTP+SSE, DCR, and the Tasks / server-rendered-UI ("MCP Apps") extensions.
  A clean read-only tools+resources server needs none of them.

Spec: <https://modelcontextprotocol.io/specification/2026-07-28/changelog> ·
blog <https://blog.modelcontextprotocol.io/posts/2026-07-28/>

## Plan

### Phase 2 — Personal API tokens (SHIPPED 2026-08-13)

Built mostly as designed here, with these differences:

- Per-user, **hashed at rest** (SHA-256, unlike the plaintext `icsToken`),
  revocable, expiring, with a shown-once `tpk_…` secret.
- **Opt-in write scopes** rather than read-only; **no per-forum scope** —
  tokens are account-wide.
- Token → user, then every request runs through the **existing viewer
  context / permission checks**, so role-filtering is automatic (`x-view-as`
  is ignored: a token always acts as its owner).
- **GraphQL-only**, so it did *not* unblock authenticated Atom feeds for
  private forums — the Atom feed is still anonymous-only. It is ready to be
  the MCP bearer credential.
- Hardening: GraphQL depth/cost validation is in place
  (`apps/api/src/graphql/depth-limit.ts`), and each token gets its own
  request budget plus a per-user `heart` action limit; tuning them to real
  traffic stays an operational follow-up in `PRODUCT.md`.

### Phase 3 — MCP server (read-only v1, by choice)

- **Target spec 2026-07-28, stateless Streamable HTTP.** Endpoint e.g.
  `POST /api/mcp` (forum resolved from the token) or
  `/api/forums/:idOrSlug/mcp` for explicit scoping.
- **Read-only v1 is a plan choice, not a constraint.** The tokens can
  write, so write tools mapped to the same scopes could follow; starting
  read-only keeps the first surface small.
- **Thin adapter over existing core reads** — the token's user supplies the
  viewer context; tools call the same functions GraphQL/REST already use.
- **v1 tools** (mirror the export/GraphQL reads): `list_forums`, `get_forum`,
  `list_topics`, `get_topic` (comments + ❤️ counts), `list_people`,
  admin-only `list_members`, `get_export`. Expose topics as **resources**
  with stable URIs. Topic search shipped 2026-08-10 (`buildFeed`'s `q`, the
  `q` arg on the GraphQL feed), so `search_topics` can join v1.
- Set `cacheScope`/`ttlMs` per forum privacy; deterministic tool order.
- Honor every constraint above (role-filtered, scopes as ceiling, no
  email, forum naming).
- **De-risk first:** small spike (one `get_topic` tool end-to-end against a
  real client) to confirm the TS SDK's days-old 2026-07-28 support is stable;
  pin SDK versions before planning the full milestone.

## The one decision to make: client auth (partly settled)

The shipped personal API tokens are the natural v1 bearer credential —
already `Authorization: Bearer tpk_…`, hashed, scoped and revocable — so
the v1 half of this decision is effectively made; what remains open is
when (and whether) to add OAuth.

- **v1 — personal token as `Authorization: Bearer`** (recommended start):
  fast, matches the roadmap, and the tokens already exist. Cost: users paste a token into client
  config; not every MCP client loves static tokens.
- **v2 — OAuth via Clerk** (Client ID Metadata Documents, per the new spec):
  the native flow where a client like Claude connects to `topic.forum` and
  does an OAuth dance — frictionless, no token-pasting. More work, but Clerk
  already speaks OIDC.

**Recommendation:** ship personal-token bearer as v1; design the token layer
so OAuth can sit on top later; treat frictionless OAuth onboarding as a
fast-follow once there's real demand.

## Open items / when we pick this up

- [x] Decide v1 auth — bearer personal token (shipped); OAuth stays the
      possible fast-follow.
- [x] Personal API tokens: schema (hashed), scopes, revocation UI, docs
      (2026-08-13).
- [x] Rate/cost limits wired to tokens (per-token request budget; depth/cost
      validation) — tune as traffic emerges.
- [ ] Re-check the MCP spec; SDK spike against the current revision; pin
      versions.
- [ ] Decide whether MCP v1 exposes write tools (scope-gated) or stays
      read-only.
- [ ] Update the API page "Planned" copy + add a forward-looking row to
      `PRODUCT.md` (currently the MCP plan lives only in the API page +
      this document).

## References

- `apps/web/src/app/(app)/f/[slug]/api/page.tsx` — Planned list + current surface
- `docs/execution-journal/2026-07-27-forum-api-naming.md` — naming freeze, tokens/MCP sequencing
- `docs/execution-journal/2026-07-27-atom-feed.md` — phase 1/2 numbering
- `docs/execution-journal/2026-07-27-api-page-and-export.md` — machine-access product principles
- `apps/api/src/rest/router.ts` — REST read/write surface (export/atom/ics)
- `docs/execution-journal/2026-08-13-personal-api-tokens.md` — the shipped token model
- `apps/api/src/auth/api-token.ts`, `apps/api/src/graphql/token-scopes.ts`, `packages/shared/src/apiTokens.ts` — token auth + scopes
- `apps/api/src/auth/clerk.ts` — Clerk session auth
- `packages/core/src/profile.ts`, `packages/db/src/schema/auth.ts` — `icsToken` precedent
- `apps/api/src/graphql/*` — GraphQL read roots an MCP server would wrap
