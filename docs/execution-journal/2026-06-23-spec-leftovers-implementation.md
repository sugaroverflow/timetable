## 2026-06-23T19:28:44Z - Specification Leftovers Implementation

### Goal

Implement the highest-impact leftovers from the specification audit: API
hardening, custom-domain routing, feed polish, settings rendering, digest copy,
media editing, and focused verification.

### Changes

- Added API request logging, in-memory rate limiting, production env validation,
  and a GraphQL depth-limit validation plugin.
- Added privacy guards for direct topic and slot mutations when a timetable is
  deactivated.
- Added public custom-domain route lookup and Next proxy rewriting from custom
  hostnames to existing timetable routes.
- Added feed pagination and changed the comments sort to latest visible public
  comment timestamp rather than comment count.
- Rendered custom timetable theme colors and role labels in the timetable shell.
- Added URL-based profile image, topic cover, and timetable cover editing.
- Added API tests for the GraphQL depth limit.

### Decisions

- Used small local middleware/plugins instead of new rate-limit or GraphQL
  hardening dependencies.
- Implemented media editing as URL fields, not binary upload/object storage, so
  existing schema fields are usable without introducing storage credentials.
- Kept custom-domain routing as a proxy rewrite to the existing `/t/[slug]`
  route tree to avoid duplicating pages.

### Tradeoffs

- Rate limiting is process-local and suitable for first testing, but not enough
  for horizontally scaled production.
- Feed pagination is limit/offset based; a true cursor API is still the better
  long-term shape for large feeds.
- URL-based media fields do not solve upload hosting, validation, resizing, or
  moderation.

### Risks

- Custom-domain proxy lookup depends on `NEXT_PUBLIC_GRAPHQL_URL` being
  reachable from the web runtime.
- Custom role labels are now rendered in the shell and feed fallback labels, but
  some lower-level copy still uses generic product words.
- Existing deployment spec, workflow, and deployment doc edits were already
  present before this implementation and were not audited as part of this pass.

### Verification

- `npm run test --workspaces --if-present`
- `npm run typecheck --workspaces --if-present`
- `npm run lint --workspaces --if-present`
- `npm run build --workspaces --if-present`

### Demo Impact

The app now demonstrates safer API boundaries, custom-domain entry points,
paginated topic feeds, branded timetable shells, and editable media fields
without requiring object storage setup.

### Customer-Facing Context

This pass moves several items from prototype-only or stored-only behavior into
reviewable product behavior while keeping operationally sensitive parts
bounded. The remaining storage and scheduler work is explicit rather than
silently implied.

### Next Recommended Step

Replace process-local rate limiting with infrastructure-aware limits, then add
true cursor pagination and production object storage uploads.
