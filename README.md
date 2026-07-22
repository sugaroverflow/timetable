# Timetable

Collaborative timetables for proposing topics, voting with hearts, sharing
availability, and shaping a schedule together.

A [Newspeak House](http://web.archive.org/web/20260718230246/https://newspeak.house/) x
[Sparkle Bureaucracy](https://www.sparklebureaucracy.org/) production.

![Timetable topic feed showing proposed sessions, hearts, and comments](docs/assets/readme/topics-view.png)

![Timetable availability view showing timeslots, availability totals, and voting controls](docs/assets/readme/availability-view.png)

## What It Does

Timetable is a multi-tenant web app. Each timetable is its own workspace with
members, roles, topics, comments, hearts, availability slots, moderation, and
dashboard analytics.

Core workflows:

- Hosts draft topics in a rich-text (TipTap) editor and submit them for review.
- Admins moderate from Pending Topics (with every host's drafts visible),
  create and reassign topics, manage members from the People page, create
  slots, and tag topics to slots.
- Electors heart topics (weighted votes), comment in threaded discussions,
  collect "My hearted topics", and mark availability.
- Hosts and admins use weighted-heart scores, a hearts cutoff, elector
  activity filters, availability breakdowns, and conflict alerts to plan the
  final schedule.
- Every member has a markdown bio shown in a popup and on the People page;
  topics get stable permalinks (`/t/{timetable}/{host}/{topic}`).
- A notifications pane collects comments on your topics and replies to you.
- Each timetable is themeable: colours, fonts, dark-mode palette, custom role
  labels, icon, and cover image — with per-user light/dark mode.
- Five visibility levels from fully public to deactivated.
- Users can subscribe to a timetable's slots through an ICS calendar feed.
- Profile images, topic covers, icons, and timetable covers can be pasted as
  URLs or uploaded directly to object storage.

## Quick Start

Prerequisites:

- Node.js 20 or newer
- Docker, or another PostgreSQL 16 instance
- Clerk application keys for authentication

```bash
npm install

cp .env.example .env
cp .env.example apps/web/.env.local

npm run db:up
npm run db:migrate
npm run db:seed
# Optional, after setting real Clerk development keys in .env:
npm run clerk:seed-dev-users
npm run dev
```

Local URLs:

- Web: `http://localhost:3000`
- API: `http://localhost:4000`
- GraphQL: `http://localhost:4000/graphql`

For Clerk development instances, test emails using `+clerk_test` can sign in
with OTP code `424242`.

The seed command reads `dev-sample-data.md` and replaces only the sample
timetable with slug `spt-test-data`. It creates deterministic local dev users
with Clerk-compatible test emails, including owner `dev_sample_admin-edwin`
(`admin-edwin+clerk_test@example.com`), without calling Clerk.

People rows in `dev-sample-data.md` accept an optional `Clerk ID` column.
When a real Clerk user ID is set, `db:seed` uses that ID directly as the local
user ID instead of generating a `dev_sample_` ID — that person can sign in with
their actual Clerk account immediately and will be recognized as the seeded
timetable owner or admin. People with a real `Clerk ID` are skipped by
`clerk:seed-dev-users` since they already have a Clerk account.

To mirror the remaining test users into a Clerk development instance, run
`npm run clerk:seed-dev-users` after `npm run db:seed`. The Clerk script refuses
non-`sk_test_` keys, creates or updates the sample people with
`externalId=dev_sample_<label>`, and the API maps that `externalId` back to the
seeded local memberships when a sample user signs in. Use
`npm run clerk:seed-dev-users -- --dry-run` to check the target Clerk instance
without writing users.

Hosted dev can run a destructive fixture refresh as an optional manual
`Deploy Dev` workflow task. When `seed_sample_data` is checked, the dev
post-deploy job resets hosted dev app data, reseeds `dev-sample-data.md`, and
creates or updates the matching Clerk development users. Production deploys
never run it.

## Docs

Detailed project docs are tracked in this repository so they can be reviewed in
pull requests with code changes.

- [Architecture](docs/ARCHITECTURE.md): apps, packages, API surfaces, auth flow,
  data model, and runtime boundaries.
- [Deployment](docs/DEPLOYMENT.md): local/dev/prod environments, Clerk,
  DigitalOcean, GitHub Actions, secrets, and cron.
- [Product](docs/PRODUCT.md): roles, workflows, privacy, notifications, sync,
  implementation status, go-live checklist, and known gaps.

Static README screenshots live in [docs/assets/readme](docs/assets/readme).
The web app logo lives in [apps/web/public/assets](apps/web/public/assets).

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Run API and web together |
| `npm run dev:api` / `npm run dev:web` | Run one app |
| `npm run typecheck` | Type-check every workspace |
| `npm run test` | Run unit tests |
| `npm run test:e2e` | Run Playwright anonymous browser smoke tests |
| `npm run lint` | Lint the web app |
| `npm run build` | Build all workspaces |
| `npm run db:generate` | Generate a SQL migration from the schema |
| `npm run db:migrate` | Apply migrations |
| `npm run db:seed` | Seed the local dev database from `dev-sample-data.md` |
| `npm run clerk:seed-dev-users` | Create/update Clerk dev users for the sample people |
| `npm run db:studio` | Open Drizzle Studio |
| `npm run db:up` / `npm run db:down` | Start or stop local Postgres |

## Testing Requirements

Pull requests should keep the full verification path green:

- `npm run build`
- `npm run typecheck`
- `npm run lint`
- `npm run test`
- `npm run test:e2e`
- `npm run db:migrate` when migrations or schema-adjacent config change

Committed audit guardrails now cover API health, REST auth boundaries for
timetables/invites/memberships/uploads, digest cron protection, ICS responses,
GraphQL depth/cost limits, shared rate-limit behavior, weighted hearts, and
anonymous browser smoke for `/`, `/sign-in`, and `/sign-up`.

The remaining testing requirements are richer authenticated browser workflows
once there is a Clerk test-user/session harness and broader GraphQL role
fixtures for future permission-sensitive changes.

Hosted post-deploy checks and rate-limit smoke commands live in
[Deployment](docs/DEPLOYMENT.md#smoke-test).

## Status

Phases 0-4 are substantially implemented, plus two product-owner QA rounds
(issue #42 → PR #56, issue #59 → PR #60) covering navigation, profiles,
theming, and moderation UX. The tracked app includes:

- sidebar navigation with a timetable switcher, per-timetable icons, and an
  in-app notifications pane with unread badge
- topic permalinks, infinite scroll, feed sorts (hearts / latest comments /
  newest-including-edits / seeded random), and "new since last visit"
  highlights
- TipTap rich-text topic editing with markdown as the source of truth
- full theming: colour tokens, font pairings, per-user dark mode, and a
  timetable dark palette
- People page with role grouping, markdown bios, and admin member editing
- five-level visibility (public / hosts only / no comments / private /
  deactivated) enforced server-side
- dashboard analytics with host-scoped elector activity filters, hearts
  cutoff, conflict alerts, topic-to-slot tagging, and ICS calendar export
- digest computation, a protected digest job endpoint, scheduled GitHub
  Actions caller, and Resend environment plumbing
- custom-domain routing hooks and separate DigitalOcean dev/prod app specs
- API hardening with GraphQL depth/cost limits, structured request/error
  logging, and database-backed hosted rate limiting
- S3-compatible uploads for profile images, topic covers, icons, and
  timetable covers

Remaining major gaps include verified production email delivery, multi-channel
notifications, hosted media bucket/CDN configuration, production DNS/Clerk
verification, custom-domain routing completion, authenticated browser test
coverage, traffic-based tuning, and feed/dashboard scalability work.

See [Product](docs/PRODUCT.md) for the full implementation status, go-live checklist, and known gaps.
