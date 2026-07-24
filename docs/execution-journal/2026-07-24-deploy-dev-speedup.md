# 2026-07-24 - Dev Deploy Speedup (10+ min → ~5 min target)

## What happened

Merge-to-live on dev was 9–11+ minutes: ~2.5 min CI gate, ~1.5 min of
redundant build work inside Deploy Dev, and a ~5 min App Platform deploy —
dominated by DO's buildpack rebuilding the `api` service, the `migrate`
pre-deploy job, and the `seed-sample-data` post-deploy job from source
(`npm ci` of the whole monorepo, up to three times, serially around the
rollout). Back-to-back merges also queue whole deploys behind each other.

## Changes

- New `apps/api/Dockerfile` (+ `Dockerfile.dockerignore`, BuildKit-only):
  node:20-alpine, workspace-scoped `npm ci --include=dev` for
  shared/db/core/api (no Next/React tree), monorepo layout preserved because
  everything runs from TypeScript sources via tsx and `seed-dev.ts` resolves
  `dev-sample-data.md` from the repo root. Verified locally: `db:migrate`
  runs and `/health` returns `ok:true` from the container.
- `.do/app.dev.yaml`: `api`, `migrate`, and `seed-sample-data` now run that
  one DOCR image (`timetable-reg/api:DEPLOY_TAG`) with per-component
  `run_command`s — nothing builds on App Platform anymore. Production
  `.do/app.yaml` deliberately untouched (human-triggered pipeline; follow-up).
- `ci.yml`: new `build-images` job (push-to-main only, `timetable-dev`
  environment) builds and pushes `web` + `api` images in parallel with
  `verify`, so images are ready the moment Deploy Dev triggers.
- `deploy-dev.yml`: skips its build when CI's images exist (fallback build
  retained for manual dispatches from commits whose CI didn't run, e.g.
  docs-only merges); prunes both `web` and `api` repos to 5 tags; cancels
  itself if a newer deploy is queued behind it (workflow_run only — manual
  dispatches may carry `seed_sample_data`); and now tags/deploys
  `workflow_run.head_sha` consistently (previously images were tagged
  `github.sha`, which can diverge from the checked-out `head_sha`).

## Lessons / gotchas

- DO source-built components are the hidden cost: each `github:` +
  `build_command` component is a full buildpack build per deploy, and
  PRE_/POST_DEPLOY jobs serialize around the rollout.
- One image can serve service + jobs on App Platform via `run_command`
  overrides — keeping migrations inside the app's network (GH runners never
  need DB access).
- Watch the 500 MiB Starter registry: two repos × 5 tags now. Layers dedupe
  while the lockfile is stable; the nightly GC reclaims the rest.
