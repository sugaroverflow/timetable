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
| `TRUST_PROXY_HOPS` | API | Express trusted proxy hop count for client IP handling |
| `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX` | API | App-level rate limit window and request cap |
| `RATE_LIMIT_BACKEND`, `RATE_LIMIT_CLEANUP_INTERVAL_MS`, `RATE_LIMIT_KEY_PREFIX` | API | `memory` for local development; `database` for shared hosted rate-limit buckets |
| `GRAPHQL_MAX_DEPTH`, `GRAPHQL_MAX_COST` | API | GraphQL validation limits |
| `NEXT_PUBLIC_API_URL` | Web | REST API base URL |
| `NEXT_PUBLIC_GRAPHQL_URL` | Web | GraphQL URL |
| `GRAPHQL_ROUTE_URL` | Web | Server-side custom-domain route lookup URL |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Web | Clerk browser SDK |
| `CLERK_SECRET_KEY` | Web, API | Clerk server SDK and token verification |
| `CRON_SECRET` | API | Digest job protection; required in hosted environments |
| `RESEND_API_KEY`, `EMAIL_FROM` | API | Digest email sending |
| `SPACES_ENDPOINT`, `SPACES_REGION`, `SPACES_BUCKET` | API | S3-compatible object-storage target for image uploads |
| `SPACES_KEY`, `SPACES_SECRET` | API | Object-storage credentials for signing direct browser uploads |
| `SPACES_KEY_PREFIX`, `SPACES_PUBLIC_BASE_URL`, `SPACES_FORCE_PATH_STYLE` | API | Optional upload key namespace, CDN/custom public URL, and path-style mode |
| `UPLOAD_MAX_IMAGE_BYTES` | API | Optional max image upload size, default `5242880` |

## GitHub Actions

| Workflow | Trigger | Target |
| --- | --- | --- |
| `.github/workflows/ci.yml` | Push to `main`, pull requests | Build, typecheck, lint, test, migrate against throwaway Postgres |
| `.github/workflows/deploy-dev.yml` | CI success on `main`, manual | Deploys `timetable-dev` from `.do/app.dev.yaml`; manual runs can optionally seed sample data |
| `.github/workflows/deploy-production.yml` | Manual only | Deploys `timetable` from `.do/app.yaml` |
| `.github/workflows/run-digests.yml` | Daily schedule, manual | Calls `POST /api/jobs/digests` with `CRON_SECRET` |

CI runs on pull requests, but `main` pushes are path-filtered to app, package,
GitHub workflow, DigitalOcean app spec, deploy, and root build files.
README/docs-only changes on `main` do not trigger CI and therefore do not
trigger dev deploys.

The dev deploy workflow is serialized with a single `deploy-dev` concurrency
group. After DigitalOcean reports a successful deploy, GitHub Actions verifies
that `/health`, `/`, and `/graphql` are reachable on `https://dev.timetable.love`.
Manual `Deploy Dev` runs include a `seed_sample_data` checkbox. When checked,
the dev App Platform post-deploy job resets hosted dev app data, runs
`npm run db:seed` against the `timetable-dev` database, and then runs
`npm run clerk:seed-dev-users` against the Clerk development instance.
Automatic deploys after `main` CI leave the checkbox unset and skip the seed
job.

Repository-level secrets:

- `DIGITALOCEAN_ACCESS_TOKEN`
- `DIGITALOCEAN_PROJECT_ID`

Per-environment secrets for `timetable-dev` and `production`:

- `CLERK_SECRET_KEY`
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CRON_SECRET`
- `RESEND_API_KEY` when digest email sending is enabled

Per-environment variables:

- `EMAIL_FROM` for the Resend sender identity

## DigitalOcean App Platform

Each App Platform spec defines:

- `api` service on port `4000`
- `web` service on port `3000`
- `migrate` pre-deploy job running `npm run db:migrate`
- dev only: `seed-sample-data` post-deploy job that resets hosted dev app data,
  runs `npm run db:seed`, and runs `npm run clerk:seed-dev-users` only when
  manually enabled through the `Deploy Dev` workflow
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

## Deploy Runbook

For dev deploys:

1. Confirm the `CI` workflow passed for the `main` commit.
2. Confirm the `Deploy Dev` workflow passed.
3. Confirm DigitalOcean shows `timetable-dev` with no in-progress deployment.
4. Open `https://dev.timetable.love/health`; it should return JSON with
   `ok: true`.
5. Run a hosted GraphQL smoke request and confirm it returns `200` with a
   `data` payload:

   ```bash
   curl -sS -X POST https://dev.timetable.love/graphql \
     -H 'content-type: application/json' \
     --data '{"query":"query { __typename }"}'
   ```

6. Open `https://dev.timetable.love/` and confirm the homepage responds.

To refresh hosted dev sample data, manually run `Deploy Dev` and check
`seed_sample_data`. This resets hosted dev app data, reseeds
`dev-sample-data.md`, and creates or updates the matching Clerk development
users after the dev deployment completes; production has no seed job.

If a deploy fails before DigitalOcean activates it, the previous active
deployment should remain live. If a deploy activates but is bad, roll back to
the previous `timetable-dev` deployment in DigitalOcean App Platform, then
re-run the health checks above. Code/config rollback does not roll back database
state, so migration-related incidents require restoring from a managed database
backup or applying a forward fix.

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

The scheduled production caller is `.github/workflows/run-digests.yml`. It runs
daily against `https://timetable.love/api/jobs/digests` and can be dispatched
manually for production or dev by selecting the GitHub Environment and job URL.

Digest delivery needs:

- `CRON_SECRET`
- `RESEND_API_KEY`
- `EMAIL_FROM`

The sender domain for `EMAIL_FROM` must be verified in the Resend dashboard
before emails will deliver. Without a verified sender identity, the job runs
but Resend rejects outbound messages.

## Rate Limiting

Hosted API traffic should use the database-backed limiter so requests are
counted across App Platform instances:

| Environment | `RATE_LIMIT_BACKEND` | `RATE_LIMIT_KEY_PREFIX` |
| --- | --- | --- |
| Local | `memory` | `timetable:development:api` |
| Dev | `database` | `timetable:dev:api` |
| Production | `database` | `timetable:production:api` |

`RATE_LIMIT_BACKEND=database` requires `DATABASE_URL` and the
`api_rate_limit_buckets` migration. Keep `TRUST_PROXY_HOPS=1` on DigitalOcean so
the limiter keys by the client IP App Platform forwards instead of the proxy
itself.

`/health` intentionally does not exercise the rate limiter. Use `POST /graphql`
or an `/api/*` request in hosted smoke checks to verify the rate-limit and
database-backed request path.

## Object Storage

The API exposes `POST /api/uploads` for signed direct browser uploads to an
S3-compatible bucket. The browser uploads the image with the returned short-lived
PUT URL, then saves the returned public URL through the existing profile, topic,
or timetable settings mutations.

Supported media surfaces:

- profile image
- topic cover image
- timetable cover image

Required API component variables:

- `SPACES_ENDPOINT`, for example `https://lon1.digitaloceanspaces.com`
- `SPACES_REGION`, for example `lon1`
- `SPACES_BUCKET`, for example `timetable`
- `SPACES_KEY`
- `SPACES_SECRET`

Use one Spaces bucket for dev and production, then isolate objects with
environment-specific prefixes:

| Environment | `SPACES_BUCKET` | `SPACES_KEY_PREFIX` |
| --- | --- | --- |
| Dev/local | `timetable` | `uploads/dev` |
| Production | `timetable` | `uploads/production` |

This keeps setup simple while preventing dev uploads from appearing in the
production prefix. Use separate buckets later only if operational isolation,
access policies, or retention rules require it.

`doctl apps update` can set these App Platform env values. The installed `doctl`
Spaces commands manage Spaces access keys only; bucket creation and CORS still
need the DigitalOcean console or `s3cmd` with a Spaces key.

If a Spaces key is created or rotated, set `SPACES_KEY` and `SPACES_SECRET` on
the relevant DigitalOcean App Platform API components before testing uploads.

Bucket CORS must allow `PUT` from the web origins (`https://dev.timetable.love`,
`https://timetable.love`, and local dev if needed) with the `Content-Type` and
`x-amz-acl` headers. The signed PUT uses `public-read`; public reads can be
served either by the bucket URL or by `SPACES_PUBLIC_BASE_URL` pointing at a
public CDN/custom domain.

Configure bucket CORS with the helper script:

```bash
brew install s3cmd
export SPACES_KEY=...
export SPACES_SECRET=...
SPACES_BUCKET=timetable SPACES_REGION=lon1 scripts/configure-spaces-cors.sh
```

The script writes the XML CORS configuration to a temporary file and applies it
with `s3cmd setcors`. Do not use `aws s3api put-bucket-cors` for Spaces; this
setup returned `NotImplemented` from DigitalOcean during the issue #8 rollout.

Optional API component variables:

- `SPACES_KEY_PREFIX`, defaulting to `uploads/<NODE_ENV>`
- `SPACES_PUBLIC_BASE_URL`, for a CDN or custom public media domain
- `SPACES_FORCE_PATH_STYLE=true`, for S3-compatible providers that require
  path-style URLs
- `UPLOAD_MAX_IMAGE_BYTES`, defaulting to 5 MB

Uploads support PNG, JPEG, WebP, GIF, and AVIF images and default to a 5 MB
limit. The bucket or CDN path must make the returned object URLs publicly
readable because profile and cover images are rendered directly in the web app.
Without the required `SPACES_*` variables, `POST /api/uploads` returns `503`.

## Smoke Test

After deploy:

1. Open `/health`; it should return JSON with `ok: true`. Note that `/health`
   passing does not guarantee GraphQL works — always follow up with step 2.
2. Send `POST /graphql` with `query { __typename }`; it should return `200`
   with a GraphQL `data` payload.
3. Sign in through Clerk.
4. Create a timetable.
5. Add roles or invite test users.
6. Create, submit, publish, heart, and comment on a topic.
7. Create slots and mark availability.
8. Open the dashboard and calendar.
9. Subscribe to the ICS URL if testing calendar sync.
10. Upload a profile, topic cover, or timetable cover image if object-storage
    credentials or bucket CORS changed.

Useful anonymous hosted smoke commands:

```bash
for host in timetable.love dev.timetable.love; do
  curl -sS -L -o /dev/null -w "$host / %{http_code}\n" "https://${host}/"
  curl -sS -L -o /dev/null -w "$host /sign-in %{http_code}\n" "https://${host}/sign-in"
  curl -sS -L -o /dev/null -w "$host /sign-up %{http_code}\n" "https://${host}/sign-up"
  curl -sS -w "\n$host /health %{http_code}\n" "https://${host}/health"
  curl -sS -X POST "https://${host}/graphql" \
    -H 'content-type: application/json' \
    --data '{"query":"query { __typename }"}' \
    -w "\n$host /graphql %{http_code}\n"
done
```

Run a short repeated GraphQL probe when checking the hosted rate limiter:

```bash
for host in timetable.love dev.timetable.love; do
  for i in 1 2 3 4 5; do
    curl -sS -o /dev/null -w "$host graphql run=$i %{http_code}\n" \
      -X POST "https://${host}/graphql" \
      -H 'content-type: application/json' \
      --data '{"query":"query { __typename }"}'
  done
done
```

For the uploads route, anonymous `POST /api/uploads` should return `401` once
the upload code is deployed. `404` means the route is not in the active
deployment; `503` means object-storage env vars are missing.

## Common Deploy Failures

- Missing DigitalOcean API scopes.
- Missing environment secrets in the selected GitHub environment.
- `.do/app*.yaml` placeholder substitution errors.
- Clerk keys from the wrong instance.
- Missing production Clerk domain/DNS setup.
- Database migration failure in the pre-deploy job.
- Hosted rate limiter misconfiguration; `/health` may still pass, so check
  `POST /graphql`.
