# Deployment

Timetable is deployed to DigitalOcean App Platform with two app services, one
migration job, and managed PostgreSQL. Clerk handles authentication.

## Environments

| | Local | Dev | Production |
| --- | --- | --- | --- |
| URL | `http://localhost:3000` | `https://dev.timetable.love` | `https://timetable.love` |
| DO app | none | `timetable-dev` | `timetable` |
| App spec | none | `.do/app.dev.yaml` | `.do/app.yaml` |
| Database | Docker Postgres | `timetable-db` | `timetable-db-prod` |
| Clerk | Development keys | Development keys | Production keys |
| Deploy trigger | `npm run dev` | CI passes on `main` | Manual workflow |
| GitHub environment | none | `timetable-dev` | `production` |

Local development uses `.env` files and Docker. Hosted environments use GitHub
repository/environment secrets and DigitalOcean-bound database credentials.

## Local Setup

```bash
npm install

cp .env.example .env
cp .env.example apps/web/.env.local

npm run db:up
npm run db:migrate
npm run dev
```

Local ports:

- Web: `3000`
- API: `4000`
- GraphQL: `/graphql`

## Environment Files

Two env files are needed locally:

- root `.env`: API and database tooling
- `apps/web/.env.local`: Next.js web app

`NEXT_PUBLIC_*` variables must be in `apps/web/.env.local`; Next.js does not
read the monorepo root `.env` for the web app.

Important variables:

| Variable | Used By | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | API, DB tooling | PostgreSQL connection |
| `DATABASE_SSL` | API, DB tooling | `require` for managed Postgres |
| `API_PORT` | API | Local API port |
| `WEB_ORIGIN` | API | CORS origin list |
| `NEXT_PUBLIC_API_URL` | Web | REST API base URL |
| `NEXT_PUBLIC_GRAPHQL_URL` | Web | GraphQL URL |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Web | Clerk browser SDK |
| `CLERK_SECRET_KEY` | Web, API | Clerk server SDK and token verification |
| `CRON_SECRET` | API | Digest job protection |
| `RESEND_API_KEY`, `EMAIL_FROM` | API | Digest email sending |
| `SPACES_*` | Reserved | Future object storage configuration |

## GitHub Actions

| Workflow | Trigger | Target |
| --- | --- | --- |
| `.github/workflows/ci.yml` | Push to `main`, pull requests | Build, typecheck, lint, test, migrate against throwaway Postgres |
| `.github/workflows/deploy-dev.yml` | CI success on `main`, manual | Deploys `timetable-dev` from `.do/app.dev.yaml` |
| `.github/workflows/deploy-production.yml` | Manual only | Deploys `timetable` from `.do/app.yaml` |

CI runs on pull requests, but `main` pushes are path-filtered to app, package,
GitHub workflow, DigitalOcean app spec, deploy, and root build files.
README/docs-only changes on `main` do not trigger CI and therefore do not
trigger dev deploys.

Repository-level secrets:

- `DIGITALOCEAN_ACCESS_TOKEN`
- `DIGITALOCEAN_PROJECT_ID`

Per-environment secrets for `timetable-dev` and `production`:

- `CLERK_SECRET_KEY`
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CRON_SECRET`

Optional runtime values such as `RESEND_API_KEY` and `EMAIL_FROM` can be added
to the API service after deploy if digest sending is enabled.

## DigitalOcean App Platform

Each App Platform spec defines:

- `api` service on port `4000`
- `web` service on port `3000`
- `migrate` pre-deploy job running `npm run db:migrate`
- managed PostgreSQL binding exposed as `DATABASE_URL`

Ingress routes:

| Path | Component |
| --- | --- |
| `/api/*` | API |
| `/graphql` | API |
| `/health` | API |
| everything else | Web |

The specs use `preserve_path_prefix: true` for API paths so Express receives the
same route prefixes it registers locally.

## Clerk

Use Clerk Development keys for local and dev. Use Clerk Production keys only for
`timetable.love`.

Required app paths:

- sign in: `/sign-in`
- sign up: `/sign-up`
- fallback redirect: `/timetables`

For production on a custom domain, create a Clerk production instance, configure
domains and DNS in Clerk, then update the GitHub `production` environment
secrets to live keys.

## Digest Cron

The digest job is exposed as:

```txt
POST /api/jobs/digests
```

It requires:

```txt
x-cron-secret: <CRON_SECRET>
```

The app computes digest content today, but production delivery needs:

- `CRON_SECRET`
- `RESEND_API_KEY`
- `EMAIL_FROM`
- an external scheduler

## Object Storage

The deployment specs reserve `SPACES_*` variables for DigitalOcean Spaces.
The tracked app currently does not include a committed upload endpoint or upload
UI, so Spaces is not required for first user tests. Update this section when the
upload implementation lands.

## Smoke Test

After deploy:

1. Open `/health`; it should return JSON with `ok: true`.
2. Sign in through Clerk.
3. Create a timetable.
4. Add roles or invite test users.
5. Create, submit, publish, heart, and comment on a topic.
6. Create slots and mark availability.
7. Open the dashboard and calendar.
8. Subscribe to the ICS URL if testing calendar sync.

## Common Deploy Failures

- Missing DigitalOcean API scopes.
- Missing environment secrets in the selected GitHub environment.
- `.do/app*.yaml` placeholder substitution errors.
- Clerk keys from the wrong instance.
- Missing production Clerk domain/DNS setup.
- Database migration failure in the pre-deploy job.
