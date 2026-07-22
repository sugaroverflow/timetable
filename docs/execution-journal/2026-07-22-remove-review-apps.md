## 2026-07-22 - Remove Per-PR Review Apps + Registry Tag Pruning

### Goal

Simplify the deploy estate ahead of the beta launch (Fatima's call, in the
wake of the registry-quota incident): the `preview`-label review-app system
provisioned a real DO app + database per labeled PR, but dev.timetable.love
has been where QA actually happens, and the extra moving parts outweighed
the value.

### Changes

- Deleted `.github/workflows/review-app.yml` (deploy + teardown jobs),
  `.do/app.review.yaml`, and `docs/review-apps.md`.
- Removed the `preview`-label instructions from `CLAUDE.md`.
- Verified no review app was live before removal (no open PRs carried the
  `preview` label, so nothing depended on the teardown job).

### Registry quota fix

Review apps built from source and never touched the container registry —
the actual cause of the 2026-07-22 quota incident was Deploy Dev pushing a
sha-tagged `web` image on every merge with no expiry (500 MiB Starter cap
reached; pushes failed with `invalid content range`; recovered with a
manual `doctl registry garbage-collection start --include-untagged-manifests`).
`deploy-dev.yml` now prunes to the newest 5 tags after each deploy and
starts a GC. A deploy racing the brief read-only GC window fails on push
and just needs `gh run rerun <id> --failed`.
