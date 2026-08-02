# Agent-access roadmap & MCP server plan

Forward-looking plan (not yet built). Written 2026-07-30. Owner: Ed.
This is the design home for the "Personal API tokens" and "MCP server"
items listed as **Planned** on the per-forum API page
(`apps/web/src/app/(app)/f/[slug]/api/page.tsx`).

## Where we are

The agent-access roadmap has numbered phases:

1. **Atom feed — SHIPPED** (2026-07-27). `/api/forums/:slug/feed.atom`, newest
   50 published topics, anonymous-only (private forums 404). See
   `docs/execution-journal/2026-07-27-atom-feed.md`.
2. **Personal API tokens (read-only) — NOT BUILT.** The prerequisite for
   everything below, and the MCP auth credential.
3. **MCP server — NOT BUILT, no code.** Only a one-line "Planned" mention.

Auth for non-browser clients today is limited to the Clerk **session** JWT
(short-lived, browser-minted — impractical for agents) or the calendar
`icsToken` UUID (`packages/core/src/profile.ts`, calendar-scoped). Personal
API tokens are net-new; the `icsToken` per-user-UUID pattern is the template.

## Product constraints an MCP server inherits (non-negotiable)

- **Read-only first.** Returns "exactly what the viewer's role can already
  see in the app" (`api/page.tsx:16`).
- **Role-filtered through existing permission checks** — never a parallel
  data path.
- **No email addresses** in the surface; **no timeslot data** until that
  feature ships (`PRODUCT.md:240`).
- **Public names say `forum`** (frozen for third parties, see `CLAUDE.md`);
  MCP tool/resource names must use forum/topic/etc.
- **Factual, access-description tone**; the API page stays the single home
  for machine-access copy (no starter prompts, no email).

## The latest MCP spec: 2026-07-28

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

### Phase 2 — Personal API tokens (build first)

Design them with MCP in mind:

- Per-user, **hashed at rest** (unlike the plaintext `icsToken`), revocable,
  with a shown-once secret.
- **Read-only scope**; optional **per-forum scope**.
- Resolve token → user, then run every request through the **existing viewer
  context / permission checks** so role-filtering is automatic.
- Unblocks authenticated Atom feeds for private forums (phase 2's original
  goal) *and* becomes the MCP bearer credential.
- Precede opening it up with the already-flagged go-live hardening: GraphQL
  depth/cost limits and DB-backed, token-scoped rate limits (`PRODUCT.md:216`).

### Phase 3 — MCP server (read-only v1)

- **Target spec 2026-07-28, stateless Streamable HTTP.** Endpoint e.g.
  `POST /api/mcp` (forum resolved from the token) or
  `/api/forums/:idOrSlug/mcp` for explicit scoping.
- **Thin adapter over existing core reads** — the token's user supplies the
  viewer context; tools call the same functions GraphQL/REST already use.
- **v1 tools** (mirror the export/GraphQL reads): `list_forums`, `get_forum`,
  `list_topics`, `get_topic` (comments + ❤️ counts), `list_people`,
  admin-only `list_members`, `get_export`. Expose topics as **resources**
  with stable URIs. Add `search_topics` **only after** topic search ships
  (currently shelved, task #8).
- Set `cacheScope`/`ttlMs` per forum privacy; deterministic tool order.
- Honor every constraint above (no email, no timeslots, forum naming).
- **De-risk first:** small spike (one `get_topic` tool end-to-end against a
  real client) to confirm the TS SDK's days-old 2026-07-28 support is stable;
  pin SDK versions before planning the full milestone.

## The one decision to make: client auth

- **v1 — personal token as `Authorization: Bearer`** (recommended start):
  fast, matches the roadmap, read-only. Cost: users paste a token into client
  config; not every MCP client loves static tokens.
- **v2 — OAuth via Clerk** (Client ID Metadata Documents, per the new spec):
  the native flow where a client like Claude connects to `topic.forum` and
  does an OAuth dance — frictionless, no token-pasting. More work, but Clerk
  already speaks OIDC.

**Recommendation:** ship personal-token bearer as v1; design the token layer
so OAuth can sit on top later; treat frictionless OAuth onboarding as a
fast-follow once there's real demand.

## Open items / when we pick this up

- [ ] Decide v1 auth (bearer token) vs waiting for OAuth — see above.
- [ ] Personal API tokens: schema (hashed), scopes, revocation UI, docs.
- [ ] Rate/cost limits wired to tokens before opening the surface.
- [ ] SDK spike against 2026-07-28; pin versions.
- [ ] Update the API page "Planned" copy + add a forward-looking row to
      `PRODUCT.md` (currently the roadmap lives only in the API page +
      execution journals).

## References

- `apps/web/src/app/(app)/f/[slug]/api/page.tsx` — Planned list + current surface
- `docs/execution-journal/2026-07-27-forum-api-naming.md` — naming freeze, tokens/MCP sequencing
- `docs/execution-journal/2026-07-27-atom-feed.md` — phase 1/2 numbering
- `docs/execution-journal/2026-07-27-api-page-and-export.md` — machine-access product principles
- `apps/api/src/rest/router.ts` — REST read/write surface (export/atom/ics)
- `apps/api/src/auth/clerk.ts` — current Bearer/session auth (no API tokens yet)
- `packages/core/src/profile.ts`, `packages/db/src/schema/auth.ts` — `icsToken` precedent
- `apps/api/src/graphql/*` — GraphQL read roots an MCP server would wrap
