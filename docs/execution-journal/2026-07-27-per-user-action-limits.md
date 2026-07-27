# 2026-07-27 - Per-user rate limits on write actions

## What happened

Follow-on from the AI-agent-access discussion: the existing rate limiting
is per-IP request-level middleware, which caps request volume but not what
one *account* can do — and it's shared by everyone behind a campus NAT.
Before we invite users to point agents/scripts at the API, the
content-creating and email-sending actions get per-user throttles.

## Implementation

`apps/api/src/http/action-limits.ts` — a per-user, per-action limiter
reusing the existing `RateLimitStore` abstraction (memory in dev, shared
database buckets in prod, same table as the IP limiter, distinct key
namespace `…:action:<action>:<userId>`).

Limits (constants, deliberately generous for humans):

- `comment` — 12/minute; enforced in `addComment`, `replyToComment`,
  `addSlotComment`.
- `topic` — 30/hour; enforced in `createTopic`.
- `invite` — 100 recipients/hour, counted per email address; enforced in
  the three REST endpoints that can send invite email (bulk invites,
  add-person, resend-invite).

GraphQL surfaces a `RATE_LIMITED` error with `retryAfterSeconds` in
extensions; REST responds 429 with a `Retry-After` header. Checks run
after permission/validation guards so denied or invalid requests don't
consume budget.

Deliberately not limited: hearts (a self-limited toggle — one per
topic/user), edits (update-in-place), timetable creation and moderation
actions (admin-gated, low volume). Easy to add to `ACTION_LIMITS` later.
