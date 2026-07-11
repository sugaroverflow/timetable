# Review apps (per-PR preview environments)

Opening a PR and adding the **`preview`** label spins up an ephemeral, fully
seeded copy of the app on DigitalOcean App Platform at a
`https://timetable-pr-<N>-xxxxx.ondigitalocean.app` URL, posted as a comment on
the PR. Closing the PR (or removing the label) tears it down.

## How it works

`.github/workflows/review-app.yml` reacts to `pull_request` events:

- **labeled / synchronize / reopened** (while the `preview` label is present) →
  renders `.do/app.review.yaml` for this PR and `doctl apps create`/`update`s an
  app named `timetable-pr-<N>`, then posts/updates a sticky comment with the URL.
- **closed / unlabeled** → deletes the app and its per-PR database, and marks the
  comment as torn down.

The app spec (`.do/app.review.yaml`) mirrors the **production** build model — the
web is built on App Platform from the PR branch with `NEXT_PUBLIC_* = ${APP_URL}`,
so both the browser and SSR talk to *this* app's own API (no cross-app leakage,
no Docker image to build) — combined with **dev** data settings (dev Clerk keys,
`DEV_SEED_USER_MAPPING`, a full reset+reseed on deploy).

### Reused infrastructure (nothing new provisioned)

| Concern | Reuse |
|---|---|
| Database | The existing `timetable-db` cluster, one database `pr_<N>` per PR (`DATABASE_URL` overrides only the db name; the `databases:` binding auto-adds the app to trusted sources). |
| Auth | The dev Clerk instance + seeded test users (OTP `424242`). |
| Object storage | The shared Spaces bucket, key prefix `uploads/pr-<N>`. |
| Secrets/CI | The `timetable-dev` GitHub Environment. |
| URL/TLS | DO's auto `*.ondigitalocean.app` domain (no DNS). |

## Cost

Each open review app runs `web` (1 GB, ~$10/mo) + `api` (0.5 GB, ~$5/mo),
billed per second — about **$15/mo prorated to the hours it's open** (~$0.50/day).
The per-PR database adds ~$0 (it lives in the shared cluster). Controls:
opt-in `preview` label, auto-teardown, a **concurrency cap** (`MAX_REVIEW_APPS`,
default 3), and the smallest viable instance sizes.

## One-time setup

1. In the **`timetable-dev`** GitHub Environment, ensure these exist (most already
   do, used by `deploy-dev.yml`): secrets `DIGITALOCEAN_ACCESS_TOKEN` (with
   **App Platform + Databases** write scope), `CLERK_SECRET_KEY`,
   `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CRON_SECRET`, `RESEND_API_KEY`,
   `SPACES_KEY`, `SPACES_SECRET`; variable `EMAIL_FROM`.
2. Create the **`preview`** label in the repo.
3. Confirm the **dev Clerk instance** accepts arbitrary preview origins (dev
   instances do by default; otherwise add `*.ondigitalocean.app`).

## First-run checks (verify on the first preview)

These are the assumptions to confirm the first time the workflow runs:

- The existing `timetable-db` cluster accepts being **attached to a second app**
  (it's a BYO/`cluster_name` reference, as dev already uses). If DO objects,
  drop the `databases:` block and instead append the app to the cluster's
  trusted sources with `doctl databases firewalls`.
- `doctl databases connection … --format URI` yields a URL ending in
  `/defaultdb` (the `sed` swap targets that).
- Managed-Postgres **max connections**: the concurrency cap (3) keeps this in
  check; raise the shared cluster's size if you lift the cap.
- Fork PRs are **not** supported (the App Platform GitHub source points at
  `sugaroverflow/timetable`, so the branch must live in this repo).

## Manual controls

- Trigger/refresh: push to the PR, or remove and re-add the `preview` label.
- Force teardown: remove the `preview` label or close the PR.
