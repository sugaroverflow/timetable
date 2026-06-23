# Setup guide (TEMPORARY)

> Temporary working doc for wiring up Clerk auth and deploying to DigitalOcean.
> Delete or fold into the README once the team has provisioned everything.

This covers two things:

1. **Clerk** — authentication (already integrated in the code).
2. **DigitalOcean** — deploying the web + API + Postgres into your team org/project.

---

## 1. Clerk

The app authenticates with Clerk. The web app uses `@clerk/nextjs`; the API
verifies Clerk session tokens with `@clerk/backend`. A local `user` row is
created on first sign-in (keyed by the Clerk user id) so domain tables can hold
foreign keys — no webhook required.

### 1.1 Dashboard

1. Create a Clerk application (or use the existing one).
2. **API keys** (Dashboard → API Keys) give you:
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` (`pk_test_…` in dev, `pk_live_…` in prod)
   - `CLERK_SECRET_KEY` (`sk_test_…` / `sk_live_…`)
3. **Enable sign-in methods** you want (email code, Google, Microsoft, …).
   Google/Microsoft SSO is configured here — no app code change needed.
4. **Paths** (Dashboard → Paths) — keep the in-app routes:
   - Sign-in URL: `/sign-in`
   - Sign-up URL: `/sign-up`
   - After sign-in/up: `/timetables`
5. **Allowed origins / domains**: add `http://localhost:3000` (dev) and your
   production web domain.

### 1.2 Environment variables

Web (`apps/web/.env.local` in dev; App Platform env in prod):

```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_xxx
CLERK_SECRET_KEY=sk_xxx
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/timetables
NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL=/timetables
NEXT_PUBLIC_API_URL=https://api.<your-domain>
NEXT_PUBLIC_GRAPHQL_URL=https://api.<your-domain>/graphql
```

API (root `.env` in dev; App Platform env in prod):

```
CLERK_SECRET_KEY=sk_xxx
DATABASE_URL=postgres://…
DATABASE_SSL=require
WEB_ORIGIN=https://<your-web-domain>
```

### 1.3 How tokens flow (for reference)

- Web server components call the API with `Authorization: Bearer <token>` via
  Clerk `auth().getToken()`.
- Web client components call the API with the token from
  `window.Clerk.session.getToken()`.
- The API verifies the token (`verifyToken`, networkless JWKS) and upserts the
  local user.
- In dev, web (`:3000`) and API (`:4000`) share `localhost`, so this also works
  without extra config. In prod, the Bearer token is origin-independent.

### 1.4 Testing in dev

Clerk dev instances support **test emails**: any address using the `+clerk_test`
subaddress (e.g. `you+clerk_test@example.com`) with the OTP code **`424242`** —
no real email is sent. Useful for local + CI sign-in.

### 1.5 Production checklist

- Swap to `pk_live_…` / `sk_live_…`.
- Add the production web domain to Clerk allowed origins.
- (Optional) Add a Clerk **webhook** for `user.deleted` if you want to hard-delete
  local user rows; not required for normal operation.

---

## 2. DigitalOcean (team org + project)

Target: App Platform for the web + API, Managed PostgreSQL for the database, and
Spaces for uploads (uploads land in Phase 1+ once `SPACES_*` is set). Everything
goes under your **team org** and is assigned to your **project**.

Prereqs: `doctl auth init` (authenticate to the team org), and note your
project name/id (`doctl projects list`).

### 2.1 Managed PostgreSQL

```bash
# Create a managed PG cluster (adjust region/size)
doctl databases create timetable-db --engine pg --version 16 --region lon1 --size db-s-1vcpu-1gb

# Get the connection string (use the "private" URI for App Platform components
# in the same region; it already includes sslmode=require)
doctl databases connection <db-id> --format URI
```

Set `DATABASE_URL` to that URI and `DATABASE_SSL=require`.

Run migrations once the DB exists and env is set:

```bash
npm run db:migrate
```

In App Platform, add this as a **pre-deploy job** (see spec below) so each
release migrates automatically.

### 2.2 Spaces (uploads — needed from Phase 1 image features)

```bash
# Create a Space (S3-compatible) in the team project
doctl spaces create timetable-uploads --region lon1   # via API/console if doctl lacks the verb
```

Then set `SPACES_ENDPOINT`, `SPACES_REGION`, `SPACES_BUCKET`, `SPACES_KEY`,
`SPACES_SECRET` (Spaces access keys are created under API → Spaces Keys).

### 2.3 App Platform (web + API in one app)

This repo is an npm-workspaces monorepo. Define two services in one App Platform
app, both building from the repo root. Example `app.yaml`:

```yaml
name: timetable
region: lon
services:
  - name: api
    github:
      repo: <org>/<repo>
      branch: main
      deploy_on_push: true
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

  - name: web
    github:
      repo: <org>/<repo>
      branch: main
      deploy_on_push: true
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

Notes:

- `NEXT_PUBLIC_*` must be **BUILD_TIME** (inlined into the client bundle).
- Routing: with both services in one app, `/graphql`, `/api`, `/health` go to the
  API and everything else to the web. Alternatively run them as two apps with
  separate domains (then point `NEXT_PUBLIC_API_URL` at the API domain).
- Node version: the buildpack honors `engines.node` (>=20). Pin to 20 or 22 if
  the buildpack default lags.

Create and assign to the team project:

```bash
doctl apps create --spec app.yaml
doctl projects resources assign <project-id> --resource "do:app:<app-id>"
# also assign the DB:
doctl projects resources assign <project-id> --resource "do:dbaas:<db-id>"
```

### 2.4 Custom domains (Phase 4)

Add the web domain (and an `api.` subdomain if running two apps) under the App's
Domains tab, or via `doctl`. Update `WEB_ORIGIN` and `NEXT_PUBLIC_*` accordingly,
then redeploy.

---

## Quick reference: what changed for Clerk

- Removed: Auth.js (`next-auth`, `@auth/drizzle-adapter`) and the
  `account` / `session` / `verification_token` tables.
- Added: `@clerk/nextjs` (web), `@clerk/backend` (API), `src/proxy.ts`
  (Clerk middleware), `/sign-in` and `/sign-up` routes.
- `user.id` is now the Clerk user id.
