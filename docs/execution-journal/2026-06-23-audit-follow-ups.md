## 2026-06-23T19:54:25Z - Audit Follow-Ups And Phase 4 Tracking

### Goal

Create a durable GitHub issue for the audit findings, include Phase 4 leftovers,
and implement the small correctness and deployment fixes that were safe to handle
immediately.

### Changes

- Created GitHub issue #8 for audit findings, direct fixes, and Phase 4
  leftovers.
- Moved implementation work onto `fix/audit-follow-ups` after confirming the
  deploy-only PR branch had already merged.
- Stopped the API rate limiter from trusting raw `X-Forwarded-For` directly.
  Express now uses a configured trusted proxy hop count before `req.ip` is used
  as the rate-limit key.
- Matched reply permissions to public comment permissions by blocking public
  replies on unpublished topics.
- Added `.github/workflows/**` to the `main` push CI path filters so workflow
  deploy changes are included in the CI and dev-deploy chain.
- Added a server-side custom-domain route lookup URL and warning logs for
  GraphQL lookup failures.
- Replaced localhost-specific Clerk fallback copy with production-neutral auth
  page copy.

### Decisions

The implementation handled direct correctness and operational visibility issues
only. Larger Phase 4 work remains tracked in issue #8 instead of being mixed into
this follow-up branch.

### Tradeoffs

Rate limiting is still process-local. This pass fixed spoof-prone keying but did
not replace app memory buckets with infrastructure or edge enforcement.

The custom-domain proxy now logs lookup failures, but it does not yet expose
metrics or a user-facing diagnostic state.

### Risks

- `TRUST_PROXY_HOPS=1` assumes the hosted API is reached through one trusted
  platform proxy. That should be revisited if the ingress topology changes.
- Feed pagination, GraphQL cost limits, object-storage uploads, scheduled
  digests, notification channels, and broader integration coverage remain Phase
  4 work.

### Verification

- `npm run typecheck --workspaces --if-present`
- `npm run test --workspaces --if-present`
- `npm run lint --workspaces --if-present`
- `npm run build --workspaces --if-present`

### Demo Impact

The sign-in/sign-up pages no longer expose development-only localhost guidance,
and custom-domain routing failures should be easier to diagnose from logs during
deployment demos.

### Customer-Facing Context

The follow-up separates immediate hardening from larger Phase 4 production
readiness. This is useful in deployment review: current fixes reduce obvious
misconfiguration and permission risks, while issue #8 remains the source of truth
for scaling and operational commitments before real users.

### Next Recommended Step

Open a PR from `fix/audit-follow-ups`, then use issue #8 to split remaining
Phase 4 work into smaller implementation issues once the immediate fixes land.
