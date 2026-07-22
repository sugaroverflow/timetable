# CLAUDE.md

Guidance for AI coding agents working in this repo. Humans: see `README.md`.

Timetable ("Sparkle Bureaucracy") is a multi-tenant app where hosts propose
topics, electors vote with weighted hearts, and admins publish and schedule.
Product context: `docs/PRODUCT.md`. Architecture: `docs/ARCHITECTURE.md`.

**Rebrand (2026-07):** the product is now branded **"Topic"** (topic.forum),
and the tenant entity is a **"forum"** in ALL user-facing copy. Code
identifiers, `@timetable/*` packages, routes (`/t/`, `/timetables`) and the
GraphQL schema deliberately keep `timetable` naming — new user-visible
strings must say forum/Topic.

## Monorepo map & boundary rules

npm workspaces (Node ≥ 20):

| Workspace | What it is |
|---|---|
| `apps/web` | Next.js 16 App Router + React 19, Base UI, Lucide icons, Clerk auth |
| `apps/api` | Express 5 + Pothos GraphQL (`graphql/schema.ts`) + REST (`rest/router.ts`) |
| `packages/core` | Business logic (topics, invites, digests, analytics…) — Drizzle queries live here |
| `packages/shared` | Pure domain logic + types (zod only): roles, permissions, hearts math, settings types |
| `packages/db` | Drizzle schema + migrations (Postgres 16) |

Dependency DAG (never violate): `shared ← db ← core ← api`, and `shared ← web`.
**The web app never imports `@timetable/core` or `@timetable/db`** — it talks to
the API over HTTP only. Types needed on both sides go in `packages/shared`
(see `shared/src/settings.ts` for the pattern).

Web data access goes through `apps/web/src/lib/transport.ts` via the four
wrappers `gqlFetch`/`clientGql` (GraphQL) and `apiFetch`/`clientApi` (REST) —
don't hand-roll `fetch` to the API. Reads are GraphQL; membership/invite/
timetable writes plus uploads/cron/ICS are REST. **This split is intentional —
do not unify the surfaces.**

## Build, test, run

- `npm run db:up` (Postgres via Docker) → `npm run db:migrate` → `npm run db:seed`
- `npm run dev` (api :4000 + web :3000), or `dev:api` / `dev:web`
- Dev sign-in: seeded Clerk test users, email OTP code **424242**
  (`npm run clerk:seed-dev-users`; re-sign-ins hit a resend cooldown — wait for
  "Resend (n)", click it, then type the code)

Every PR must keep green (CI enforces this):
`npm run build` · `npm run typecheck` · `npm run lint` · `npm run format:check`
· `npm run test` · `npm run test:e2e` · `npm run db:migrate` when
schema/migrations change. Run `npm run format` before committing (Prettier
defaults; YAML/Markdown are exempt — deploy specs are sed-templated).

Tests are vitest (`packages/shared`, `apps/api`, `apps/web`) + one Playwright
smoke suite (`tests/e2e/`). Follow existing patterns:
`apps/web/src/lib/transport.test.ts`, `packages/shared/src/hearts.test.ts`.
Lint covers everything: `apps/web` has its own Next config; the root
`eslint.config.mjs` lints `apps/api`, `packages/*`, `tests/`, `scripts/`.

## Git & deploy workflow

- `main` is protected: **no direct pushes** — branch + PR, the CI `verify`
  check must pass, then merge (no human review required;
  `gh pr merge <n> --auto --squash` is the norm).
- Merging to `main` **auto-deploys dev** (dev.timetable.love) when CI is green.
  A red CI on main makes Deploy Dev show as `skipped`, not failed — check
  `gh run list --workflow=deploy-dev.yml` after merging.
- **Never run `deploy-production.yml` or touch the `timetable` (prod) DO app —
  production deploys are human-triggered only.** Same for repo settings,
  rulesets, and DO infrastructure (`doctl`).
- Never commit secrets. Env shape lives in `.env.example`.

## Conventions

- Notable changes get an entry in `docs/execution-journal/YYYY-MM-DD-<slug>.md`
  (see existing entries for the format) and update `docs/ARCHITECTURE.md` if
  the structure changed.
- Styling is a two-tier token system: semantic tokens in
  `apps/web/src/app/tokens.css` (light + dark), global classes in
  `globals.css`. Use `var(--token)` — no hardcoded hex in CSS, no inline color
  literals. Fonts/spacing/z-index come from the scales in `tokens.css`.
- UI primitives come from `@base-ui/react` (Dialog, Menu, Toast, …); icons
  from `lucide-react`.
- Per-timetable permissions: check `packages/shared/src/permissions.ts`
  (`canModerate`, `canManageMembers`, …) — don't test roles ad hoc.

## Gotchas (learned the hard way)

- Postgres `ALTER TYPE … ADD VALUE` can't run inside a transaction — Drizzle
  migrations must **recreate the enum** instead (see migrations 0013/0014).
- "Draft" means two things historically: the draft **topic status is removed**
  (dead references may lurk), but the "**drafting thread**" — `admin_only`
  comment visibility — is a live feature. Never blanket-delete "draft" matches.
- `apps/web/.next/` build output pollutes searches — scope greps to `src/`.
- Seed fixture bodies in `dev-sample-data.md` must not contain `^## ` lines
  (breaks the section parser); `###` is safe.
- The API refuses to boot when `SPACES_BUCKET` is set without
  `SPACES_KEY`/`SPACES_SECRET` — keep app specs and workflow env in sync.
