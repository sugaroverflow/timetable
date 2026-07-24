# 2026-07-24 - DO Apps Renamed to topic-prod / topic-dev (Mid-Launch)

## What happened

During the topic.forum launch window (issue #93), the first production deploy
run failed: `app "timetable" does not exist yet, creating...` →
`409 App domain already exists`. The DO App Platform apps had been renamed in
the console (`timetable` → `topic-prod`, `timetable-dev` → `topic-dev`) as
part of the rebrand, and `digitalocean/app_action` matches apps by the spec's
`name:` field — no match means it tries to *create* the app, which collides
with the domains still attached to the renamed one. The same failure was
latent for every future dev deploy.

## Changes

- `.do/app.yaml` `name:` → `topic-prod`; `.do/app.dev.yaml` `name:` →
  `topic-dev` (+ header comments).
- `docs/DEPLOYMENT.md` environments table and runbook references,
  `CLAUDE.md` guardrail line, deploy-dev step label.
- Deliberately unchanged: GitHub **environment** names (`timetable-dev`,
  `production`), the `timetable-db` spec component + `timetable-db-prod`
  cluster name, the `timetable-dev`/`topicforum` buckets, and all
  `@timetable/*` code naming.

## Lesson

DO app renames are invisible until the next deploy, then fail it hard.
App Platform app names are load-bearing for `app_action` — rename console-side
and spec-side together, ideally not mid-launch.
