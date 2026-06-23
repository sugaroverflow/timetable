# Timetable

Collaborative timetables — a multi-tenant app for proposing topics, voting with
hearts, sharing availability, and moderating a schedule. Produced by Sparkle
Bureaucracy.

See [Specifications.md](Specifications.md) for the product spec and
`.cursor/plans/` for the phased implementation plan. The original single-file
prototype lives in [timetable.html](timetable.html) and is the **design
reference only** — it is being replaced by this application.

## Status: Phase 0 — Foundation

Implemented:

- Monorepo (npm workspaces): Next.js web app, Express + GraphQL API, shared
  packages.
- PostgreSQL schema via Drizzle: users, timetables, per-timetable memberships
  (roles), and pending invites — plus Auth.js tables.
- Magic-link auth (Auth.js v5), with database sessions shared between web and API.
- Multi-tenancy: create timetables, switch between them, per-timetable roles.
- Invite by email (existing users added immediately; unknown emails get a
  pending invite claimed on sign-up).
- Role management (owner/admin/host/elector) with the owner protected.

Topic feed, availability calendar, notifications, and custom domains arrive in
later phases (see the plan).

## Architecture

```
apps/
  web/    Next.js 16 App Router — UI, Auth.js, server actions
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
#   then edit values (at minimum set AUTH_SECRET: `openssl rand -base64 32`)

# 3. Start PostgreSQL (Docker)
npm run db:up

# 4. Apply migrations
npm run db:migrate

# 5. Run web + API together
npm run dev
#   web → http://localhost:3000
#   api → http://localhost:4000  (GraphQL at /graphql)
```

In local development without `RESEND_API_KEY`, magic-link sign-in URLs are
printed to the web server console instead of being emailed.

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
- `AUTH_SECRET`, `AUTH_URL` — Auth.js.
- `RESEND_API_KEY`, `EMAIL_FROM` — magic-link email (optional in dev).
- `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_GRAPHQL_URL` — where the web app reaches
  the API.
- `SPACES_*` — DigitalOcean Spaces (used from Phase 1 for uploads).

## Deployment (DigitalOcean)

- Web (`apps/web`) and API (`apps/api`) deploy to DigitalOcean App Platform
  (or a Droplet).
- Database: DigitalOcean Managed PostgreSQL (`DATABASE_SSL=require`).
- Uploads: DigitalOcean Spaces (S3-compatible).
- Run `npm run db:migrate` as a release/pre-deploy step.
