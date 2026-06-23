# Timetable

Collaborative timetables — a multi-tenant app for proposing topics, voting with
hearts, sharing availability, and moderating a schedule. Produced by Sparkle
Bureaucracy.

See [Specifications.md](Specifications.md) for the product spec and
`.cursor/plans/` for the phased implementation plan. The original single-file
prototype lives in [timetable.html](timetable.html) and is the **design
reference only** — it is being replaced by this application.

## Status: Phases 0–3 complete; Phase 4 groundwork started (auth via Clerk)

A pre-Phase-4 audit and the cleanup/next-steps checklist live in
[NEXT_STEPS.md](NEXT_STEPS.md). Phase 4 (notifications, custom domains, and
dashboard analytics) is in progress — the analytics service layer exists; the
GraphQL/UI wiring, digests, and ICS export are still to come.

Phase 0 — Foundation:

- Monorepo (npm workspaces): Next.js web app, Express + GraphQL API, shared
  packages.
- PostgreSQL via Drizzle (users, timetables, memberships, invites).
- Authentication via Clerk (the API verifies Clerk session tokens; a local
  `user` row is created on first sign-in). _Phase 0 originally shipped Auth.js
  magic links; replaced by Clerk in Phase 2._
- Multi-tenancy: create timetables, switch between them, per-timetable roles.
- Invite by email (existing users added immediately; unknown emails get a
  pending invite claimed on sign-up). Role management with the owner protected.

Phase 1 — Topic Feed:

- Topics with markdown bodies and a draft -> submitted -> published/unpublished
  lifecycle.
- Weighted hearts (`1 / # published topics hearted`), computed server-side;
  host/admin-only score and per-elector breakdown.
- Threaded comments with public and host-only visibility; admin hide/unhide.
- Moderation queue (publish / request changes / reject) and an append-only
  activity log.
- Host dashboard (draft/submit/unpublish/edit), role-aware topic feed, and
  admin settings (role labels + theme colors persisted).

Phase 2 — Profiles, privacy & polish:

- Anonymous read of **public** timetables (feed + public comments); private
  redirects to sign-in; deactivated is admin-only — enforced in the API.
- User profile editing (name, about) and email-digest preferences (stored;
  sending is Phase 4).
- Admin timetable profile + visibility editing, topic unpublish, and
  archive-hearts (vote reset); comment hide/unhide.
- Host filter on the feed.

Phase 3 — Availability calendar:

- Admin timeslot CRUD with weekly-repeat generation.
- Elector availability (red/yellow/green, default yellow) plus a weekday-pattern
  helper that applies a state to every slot on a given weekday.
- Host/admin calendar views: aggregate availability per slot, per-elector
  breakdown, and audience filters (all electors / hearted my topics / hearted a
  specific topic).
- Slot discussion threads (host/admin) and admin slot–topic tagging.

Phase 4 — Notifications, domains, analytics (in progress):

- Done: analytics service layer (`packages/core/analytics.ts`) for dashboard
  metrics, leaderboards, unallocated topics, and slot conflicts; schema for
  digest tracking (`users.lastDigestAt`) and ICS subscription (`users.icsToken`).
- To do: GraphQL/UI for the dashboard, daily digest jobs, ICS export endpoint,
  and custom-domain mapping. See [NEXT_STEPS.md](NEXT_STEPS.md).

Authentication is handled by **Clerk** (see [SETUP.md](SETUP.md)); Auth.js was
removed and `user.id` is the Clerk user id.

Deferred (see [NEXT_STEPS.md](NEXT_STEPS.md)): DigitalOcean Spaces uploads,
cursor-based infinite scroll (decided: paginate the `recent` sort), multi-channel
notifications (WhatsApp/Matrix).
Notifications and custom domains arrive in Phase 4.

## Architecture

```
apps/
  web/    Next.js 16 App Router — UI, Clerk auth, server actions
  api/    Express + GraphQL Yoga (Pothos) — GraphQL for the UI, REST for admin
packages/
  db/     Drizzle schema, client, migrations
  core/   Domain/service layer (timetables, invites, members) — shared by web + api
  shared/ Pure logic: roles, permissions, weighted-heart math, zod validation
```

- **GraphQL** (`/graphql`) serves the UI (role-aware reads).
- **REST** (`/api/*`) serves admin/integration mutations (create timetable,
  invites, role changes).
- Both call the same `@timetable/core` service layer and enforce authorization
  through `@timetable/shared`.

## Prerequisites

- Node.js >= 20 (developed on Node 25)
- Docker (for local PostgreSQL) — or any PostgreSQL 16 instance

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env                 # used by the API and DB tooling
cp .env.example apps/web/.env.local  # used by the Next.js web app
#   then set your Clerk keys (NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY, CLERK_SECRET_KEY).
#   See SETUP.md for Clerk + DigitalOcean configuration.

# 3. Start PostgreSQL (Docker)
npm run db:up

# 4. Apply migrations
npm run db:migrate

# 5. Run web + API together
npm run dev
#   web → http://localhost:3000
#   api → http://localhost:4000  (GraphQL at /graphql)
```

Sign in with Clerk. In dev you can use a test email (`you+clerk_test@example.com`)
with the OTP `424242` — no real email is sent. See [SETUP.md](SETUP.md).

## Common scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Run API and web together |
| `npm run dev:api` / `npm run dev:web` | Run one app |
| `npm run typecheck` | Type-check every workspace |
| `npm run test` | Run unit tests (vitest) |
| `npm run lint` | Lint (web) |
| `npm run build` | Build all workspaces |
| `npm run db:generate` | Generate a new SQL migration from the schema |
| `npm run db:migrate` | Apply migrations |
| `npm run db:studio` | Open Drizzle Studio |
| `npm run db:up` / `npm run db:down` | Start/stop local Postgres |

## Environment variables

See [.env.example](.env.example). Key ones:

- `DATABASE_URL` — Postgres connection string. Set `DATABASE_SSL=require` for
  DigitalOcean Managed PostgreSQL.
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` — Clerk auth (web +
  API). Plus the `NEXT_PUBLIC_CLERK_SIGN_IN_URL` / `..._SIGN_UP_URL` paths.
- `RESEND_API_KEY`, `EMAIL_FROM` — email digests (Phase 4; optional).
- `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_GRAPHQL_URL` — where the web app reaches
  the API.
- `SPACES_*` — DigitalOcean Spaces (uploads; Phase 1+ once configured).

## Deployment (DigitalOcean)

- Web (`apps/web`) and API (`apps/api`) deploy to DigitalOcean App Platform
  (or a Droplet).
- Database: DigitalOcean Managed PostgreSQL (`DATABASE_SSL=require`).
- Uploads: DigitalOcean Spaces (S3-compatible).
- Run `npm run db:migrate` as a release/pre-deploy step.

See [SETUP.md](SETUP.md) for the full Clerk + DigitalOcean walkthrough.

## Known limitations & roadmap

The full audit and prioritized next steps live in the project plan
(`.cursor/plans/`). Headlines:

**Hardening (do before real users):**

- No GraphQL depth/cost limit or API rate limiting yet.
- Topic/slot mutations check roles but not timetable `deactivated` privacy.
- No environment-variable validation (a missing `CLERK_SECRET_KEY` looks like
  "signed out").

**Feature gaps:**

- Custom role labels and theme colors are **saved but not yet applied** in the UI.
- No pagination/infinite scroll yet (decided approach: paginate the `recent` sort).
- Activity log covers topic moderation only (not hearts/comments).
- Image uploads are URL-only until DigitalOcean Spaces is configured.

**Testing/ops:**

- Only unit tests for the weighted-heart math; integration/E2E/IDOR tests are
  the biggest gap.
- Logging is `console` only; no structured logging or error reporting.

**Next phase:** Phase 4 — email digests (preferences already stored), custom
domains, multi-topic slot conflict alerts, and dashboard analytics.
