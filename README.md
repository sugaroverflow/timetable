# Timetable

Collaborative timetables — a multi-tenant web app for proposing topics, voting
with hearts, sharing availability, and moderating a schedule. Produced by
Sparkle Bureaucracy.

The original single-file prototype lives in [timetable.html](timetable.html) and
is kept as a **design reference only**; this application replaces it. The product
spec is in [Specifications.md](Specifications.md).

> **Status:** the full phased plan (foundation → topic feed → profiles/privacy →
> availability calendar → notifications/domains/analytics) is implemented.
> Authentication is handled by **Clerk**. The app runs on **DigitalOcean**
> (App Platform + Managed PostgreSQL).

## Contents

- [What it does](#what-it-does)
- [Architecture](#architecture)
- [Getting started (local dev)](#getting-started-local-dev)
- [Environment variables](#environment-variables)
- [Scripts](#scripts)
- [Deployment (Clerk + DigitalOcean)](#deployment-clerk--digitalocean)
- [Roadmap & known limitations](#roadmap--known-limitations)

---

## What it does

A **timetable** is an independent workspace (tenant) with its own members,
topics, and schedule. One person can belong to many timetables and hold
different roles in each.

**Roles** (scoped per timetable, stored on the membership):

| Role | Can |
| --- | --- |
| Owner | Everything an admin can, plus is the protected owner of the timetable |
| Admin | Moderate topics, hide comments, manage members/roles, edit settings, create timeslots, tag topics to slots, view the dashboard |
| Host | Propose topics (draft → submit), see weighted-heart breakdowns and host-only threads, join slot discussions, view the dashboard |
| Elector | Read published topics, heart and comment on them, set availability |

**Topic feed.** Hosts draft topics (markdown), submit them for moderation, and
admins publish / request changes / reject. Electors heart and comment
(threaded; public + host-only visibility). Hearts are **weighted**: each elector
spreads a total influence of 1 across the topics they heart
(`weight = 1 / number of published topics they hearted`), so hearting fewer
topics counts for more. Hosts/admins see the weighted score and per-elector
breakdown; electors do not.

**Availability calendar.** Admins create timeslots (single or weekly-repeating).
Electors mark availability per slot (🔴/🟡/🟢, default 🟡) or apply a weekday
pattern in bulk. Hosts/admins see aggregate counts and a per-elector breakdown,
filtered by audience (all electors / electors who hearted my topics / electors
who hearted a specific topic). Slots have host/admin discussion threads and can
be tagged with topics; tagging two topics to one slot raises a **conflict**
alert.

**Moderation & admin.** A moderation queue, an append-only activity log,
member/role management, invites by email, timetable profile + visibility
(`public` / `private` / `deactivated`), custom role labels, theme colours, and a
**dashboard** (topic-status counts, weighted topic & host leaderboards,
unallocated published topics, slot conflicts).

**Privacy.** `public` timetables are readable by anonymous visitors (feed +
public comments; hearting/posting still require sign-in); `private` is
members-only; `deactivated` is admins-only. Enforced server-side.

**Notifications & sync.** Opt-in daily email digests (new topics, replies to
your comments, activity on your topics) and an ICS calendar feed you can
subscribe to from any calendar app.

---

## Architecture

A single npm-workspaces monorepo:

```
apps/
  web/    Next.js 16 (App Router) — UI, Clerk auth, server actions
  api/    Express + GraphQL Yoga (Pothos) — GraphQL for the UI, REST for admin/jobs
packages/
  db/     Drizzle ORM schema, client, SQL migrations
  core/   Domain/service layer — shared by web + api (the only place with business logic)
  shared/ Pure logic: roles, permissions, weighted-heart math, zod validation
```

### Stack

| Concern | Choice |
| --- | --- |
| Web | Next.js 16 App Router, React 19 |
| Auth | Clerk (`@clerk/nextjs` on web, `@clerk/backend` on the API) |
| API | Express + GraphQL Yoga with Pothos (code-first schema) |
| Database | PostgreSQL 16 + Drizzle ORM / drizzle-kit migrations |
| Markdown | markdown-it + sanitize-html (rendered server-side) |
| Email | Resend (digests); logs to console in dev |
| Hosting | DigitalOcean App Platform + Managed PostgreSQL (+ Spaces for uploads) |
| Tooling | TypeScript, ESLint, Vitest, Docker (local Postgres) |

### API surface

- **GraphQL** at `/graphql` powers the UI with role-aware reads and most
  mutations: `me`, `myTimetables`, `timetable`, `topicFeed`, `hostDashboard`,
  `moderationQueue`, `activityTimeline`, `calendar`, `dashboard`,
  `timetableMembers`, `myIcsToken`, `timetableByDomain`, plus mutations for
  topics (`createTopic`/`submitTopic`/`moderateTopic`/…), `heartTopic`,
  comments, availability (`setAvailability`/`setWeekdayAvailability`), slots,
  profiles, and settings.
- **REST** under `/api/*` handles timetable lifecycle, integrations, and jobs:
  - `POST /api/timetables` — create a timetable (creator becomes owner+admin)
  - `POST /api/timetables/:id/invites` — invite emails / assign roles
  - `PATCH /api/memberships/:id/roles` — change a member's roles
  - `POST /api/jobs/digests` — cron-triggered digest send (header `x-cron-secret`)
  - `GET /api/timetables/:idOrSlug/calendar.ics` — ICS feed (public, or
    `?token=<user.icsToken>` for private)
  - `GET /health`

Both layers call the same `@timetable/core` services and enforce authorization
via `@timetable/shared`.

### Authentication flow

Clerk owns identity; the database keeps a local `user` row whose **id is the
Clerk user id**, created on first sign-in (so domain tables can hold foreign
keys without calling Clerk).

- Web **server** code calls the API with `Authorization: Bearer <token>` from
  Clerk's `auth().getToken()`.
- Web **client** components use the token from `window.Clerk.session.getToken()`.
- The API verifies the token with `verifyToken` (networkless JWKS) and upserts
  the local user; pending email invites are claimed on first sign-in and when
  the user opens their timetable list.

There are no Auth.js tables and no webhook is required for normal operation.

### Data model

`users`, `timetables`, `timetable_memberships`, `timetable_invites`, `topics`,
`hearts`, `comments`, `activity_events`, `timeslots`, `availability`,
`slot_comments`, `slot_topics`. Migrations live in `packages/db/drizzle` (0000–0005).

---

## Getting started (local dev)

### Prerequisites

- Node.js >= 20 (developed on Node 25)
- Docker (for local PostgreSQL) — or any PostgreSQL 16 instance
- A Clerk application (free) for auth keys — see [Deployment](#deployment-clerk--digitalocean)

### Steps

```bash
# 1. Install dependencies
npm install

# 2. Configure environment (see "Environment variables" below)
cp .env.example .env                 # API + DB tooling (root)
cp .env.example apps/web/.env.local  # Next.js web app
#   set your Clerk keys in BOTH files (CLERK_SECRET_KEY in both;
#   NEXT_PUBLIC_CLERK_* only matter in apps/web/.env.local)

# 3. Start PostgreSQL (Docker)
npm run db:up

# 4. Apply migrations
npm run db:migrate

# 5. Run web + API together
npm run dev
#   web → http://localhost:3000
#   api → http://localhost:4000  (GraphQL at /graphql)
```

### Test sign-in (dev)

Clerk development instances accept **test emails** using the `+clerk_test`
subaddress (e.g. `you+clerk_test@example.com`) with the fixed OTP code
**`424242`** — no real email is sent. Handy for local use and CI.

---

## Environment variables

See [.env.example](.env.example). There are **two env files** loaded by
different mechanisms — a variable only takes effect in the file whose consumer
reads it:

- **`apps/web/.env.local`** — the Next.js web app (Next auto-loads `.env*` from
  `apps/web`; it does **not** read the root `.env`). All `NEXT_PUBLIC_CLERK_*`
  and `NEXT_PUBLIC_*` vars must live here.
- **root `.env`** — the API (`apps/api/src/load-env.ts`) and DB tooling
  (`packages/db`) load this explicitly. `NEXT_PUBLIC_*` here has no effect.

`CLERK_SECRET_KEY` is needed in **both** (the API verifies tokens; the web app's
server-side Clerk calls use it too).

| Variable | Where | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | root | Postgres connection string |
| `DATABASE_SSL` | root | `require` for DigitalOcean Managed PG, else `disable` |
| `CLERK_SECRET_KEY` | both | Clerk secret (`sk_test_…` / `sk_live_…`) |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | web | Clerk publishable key (`pk_…`) |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` / `..._SIGN_UP_URL` | web | `/sign-in`, `/sign-up` |
| `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL` / `..._SIGN_UP_...` | web | `/timetables` |
| `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_GRAPHQL_URL` | web | where the browser/web server reaches the API |
| `WEB_ORIGIN` | root | allowed CORS origin(s) for the API |
| `API_PORT` | root | API port (default 4000) |
| `RESEND_API_KEY`, `EMAIL_FROM` | root | digest email (optional in dev — logs to console without a key) |
| `CRON_SECRET` | root | shared secret for `POST /api/jobs/digests` |
| `SPACES_*` | root | DigitalOcean Spaces for uploads (optional, not yet wired) |

---

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Run API and web together |
| `npm run dev:api` / `npm run dev:web` | Run one app |
| `npm run typecheck` | Type-check every workspace |
| `npm run test` | Run unit tests (Vitest) |
| `npm run lint` | Lint the web app |
| `npm run build` | Build all workspaces |
| `npm run db:generate` | Generate a SQL migration from the schema |
| `npm run db:migrate` | Apply migrations |
| `npm run db:studio` | Open Drizzle Studio |
| `npm run db:up` / `npm run db:down` | Start/stop local Postgres (Docker) |

---

## Deployment (Clerk + DigitalOcean)

Target: DigitalOcean **App Platform** for web + API, **Managed PostgreSQL** for
the database, and (optionally) **Spaces** for uploads. Provision everything under
your team org and assign it to your project.

### 1. Clerk

1. Create a Clerk application (or reuse one).
2. **API Keys** → `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY`
   (`pk_test_…`/`sk_test_…` in dev, `pk_live_…`/`sk_live_…` in prod).
3. Enable the sign-in methods you want (email code, **Google**, **Microsoft**, …)
   — SSO is configured in the dashboard, no app code change needed.
4. **Paths**: Sign-in `/sign-in`, Sign-up `/sign-up`, after sign-in/up
   `/timetables`.
5. **Allowed origins**: add `http://localhost:3000` (dev) and your production
   web domain.
6. Production checklist: swap to live keys, add the prod domain, and (optional)
   add a `user.deleted` webhook if you want to hard-delete local user rows.

### 2. DigitalOcean

Prereqs: `doctl auth init` (authenticate to the team org); note your project id
(`doctl projects list`).

**Managed PostgreSQL**

```bash
doctl databases create timetable-db --engine pg --version 16 --region lon1 --size db-s-1vcpu-1gb
doctl databases connection <db-id> --format URI   # use as DATABASE_URL (sslmode=require)
```

Set `DATABASE_URL` to that URI and `DATABASE_SSL=require`.

**Spaces (optional — for future image uploads)**

Create a Space and set `SPACES_ENDPOINT`, `SPACES_REGION`, `SPACES_BUCKET`,
`SPACES_KEY`, `SPACES_SECRET` (keys under API → Spaces Keys).

**App Platform** — one app, two services (web + API) building from the repo
root, plus a pre-deploy migration job. Example `app.yaml`:

```yaml
name: timetable
region: lon
services:
  - name: api
    github: { repo: <org>/<repo>, branch: main, deploy_on_push: true }
    source_dir: /
    build_command: npm ci
    run_command: npm run start -w @timetable/api
    http_port: 4000
    instance_size_slug: basic-xxs
    routes:
      - path: /graphql
      - path: /api
      - path: /health
    envs:
      - { key: CLERK_SECRET_KEY, scope: RUN_TIME, type: SECRET }
      - { key: DATABASE_URL, scope: RUN_TIME, type: SECRET }
      - { key: DATABASE_SSL, value: "require" }
      - { key: WEB_ORIGIN, value: "https://<web-domain>" }
      - { key: API_PORT, value: "4000" }
      - { key: CRON_SECRET, scope: RUN_TIME, type: SECRET }
      - { key: RESEND_API_KEY, scope: RUN_TIME, type: SECRET }

  - name: web
    github: { repo: <org>/<repo>, branch: main, deploy_on_push: true }
    source_dir: /
    build_command: npm ci && npm run build -w @timetable/web
    run_command: npm run start -w @timetable/web
    http_port: 3000
    instance_size_slug: basic-xxs
    routes:
      - path: /
    envs:
      - { key: NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY, scope: BUILD_TIME }
      - { key: CLERK_SECRET_KEY, scope: RUN_TIME, type: SECRET }
      - { key: NEXT_PUBLIC_API_URL, scope: BUILD_TIME }
      - { key: NEXT_PUBLIC_GRAPHQL_URL, scope: BUILD_TIME }
      - { key: NEXT_PUBLIC_CLERK_SIGN_IN_URL, value: "/sign-in", scope: BUILD_TIME }
      - { key: NEXT_PUBLIC_CLERK_SIGN_UP_URL, value: "/sign-up", scope: BUILD_TIME }

jobs:
  - name: migrate
    kind: PRE_DEPLOY
    github: { repo: <org>/<repo>, branch: main }
    source_dir: /
    build_command: npm ci
    run_command: npm run db:migrate
    envs:
      - { key: DATABASE_URL, scope: RUN_TIME, type: SECRET }
      - { key: DATABASE_SSL, value: "require" }
```

```bash
doctl apps create --spec app.yaml
doctl projects resources assign <project-id> --resource "do:app:<app-id>"
doctl projects resources assign <project-id> --resource "do:dbaas:<db-id>"
```

Notes:

- `NEXT_PUBLIC_*` must be **BUILD_TIME** (inlined into the client bundle).
- With both services in one app, `/graphql`, `/api`, `/health` route to the API
  and everything else to the web. Alternatively run two apps with separate
  domains and point `NEXT_PUBLIC_API_URL` at the API domain.
- The buildpack honours `engines.node` (>=20); pin to 20/22 if needed.
- Migrations run automatically via the pre-deploy job.

**Digests** — schedule `POST https://<api>/api/jobs/digests` with the
`x-cron-secret: <CRON_SECRET>` header (e.g. a DigitalOcean scheduled job or
external cron) to send daily digests.

**Custom domains** — set a timetable's custom domain in its settings; add the
domain (and an `api.` subdomain if running two apps) under the App's Domains tab
or via `doctl`, then update `WEB_ORIGIN` / `NEXT_PUBLIC_*` and redeploy.

---

## Roadmap & known limitations

The product is feature-complete against the spec. Remaining hardening and
optional work:

**Hardening (before real users):**

- No GraphQL depth/cost limit or API rate limiting yet.
- No env-var validation (a missing `CLERK_SECRET_KEY` looks like "signed out").
- `console`-only logging; no structured logging or error reporting.

**Performance:**

- N+1 reads worth revisiting at scale: `ManagedTopic.hostName`/`feedback`
  resolvers and `buildFeed` (loads all timetable hearts per request). Consider
  dataloaders or a materialized weighted score. The digest job is O(users).

**Testing:**

- Only unit tests for the weighted-heart math. Biggest gaps: permission-guard
  and topic/heart lifecycle unit tests, an integration test per role, and E2E.

**Feature follow-ups:**

- Cursor-based infinite scroll (decided approach: paginate the `recent` sort).
- DigitalOcean Spaces uploads — avatars and topic/timetable covers are URL-only
  until `SPACES_*` is configured.
- Optional multi-channel notifications (WhatsApp / Matrix / webhooks).
- Activity log currently covers topic moderation (not hearts/comments).
