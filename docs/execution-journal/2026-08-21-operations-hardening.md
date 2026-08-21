# Operations hardening ahead of running a real programme (Ed, 2026-08-21)

Ed is about to run his programme on Topic. He asked for the **infrastructure**
failure modes — the ways the plumbing stops working, loses data, or fails
silently — rather than product risk. Full register and incident runbook:
`docs/OPERATIONS.md`. This entry records what changed in the code.

## The measured finding: the hosted rate limiter is inert (R1)

Eight identical `POST /graphql` requests to `dev.timetable.love`, forced onto
IPv4 from one machine, came back attributed to **four different buckets** —
interleaving `ratelimit-reset` values and `ratelimit-remaining` moving
non-monotonically (299, 299, 297, 297, 297, 298, 296, 296).

The store is fine: `bucketKey` is the primary key of `api_rate_limit_buckets`,
so the upsert is correct. The scatter is at the _key_ level, so `req.ip` itself
varies per request — `TRUST_PROXY_HOPS=1` is landing Express on a rotating
DigitalOcean edge address rather than the client.

So the API is effectively **unlimited** (an abuser's traffic never fills a
bucket) while _still_ being able to 429 innocent users, because those buckets
are shared proxies filling from aggregate traffic. It also pays a Postgres
upsert per request for the privilege.

This **supersedes** the earlier code-reading prediction that server-side
rendering would collapse into one shared bucket — SSR scatters across the same
pool. The failure is inversion, not concentration.

The right hop count can't be guessed from outside, so this ships a diagnostic
rather than a guess: `DEBUG_FORWARDING=true` (dev spec only) makes `/health`
report `req.ip`, `req.ips` and the raw `X-Forwarded-For`. Read it off hosted
dev, then set `TRUST_PROXY_HOPS` from measurement. **R1 is not fixed yet** —
this is the instrument, not the repair.

## Fail open, never closed (R2)

`rate-limit.ts` returned 503 to _every_ request when the bucket store threw.
The limiter fronts `/graphql` and `/api`, so any database wobble became a total
outage. It now logs and calls `next()`. A test pins this so nobody reverts the
trade.

## `/health` tells the truth (R3)

It returned `{ok: true}` unconditionally — the check DigitalOcean uses to decide
whether the API is alive. Postgres unreachable, pool exhausted, schema broken:
all read as healthy, so no restart and no signal.

Now `select 1` behind a timeout, 503 + `{"db":"down"}` on failure
(`http/health.ts`, injectable DB seam like the rate-limit store). It stays
outside the limiter — a throttleable health probe is not a health probe. DO's
failure threshold is set slack (5 × 10s) because at `instance_count: 1` a
restart _is_ downtime, so a blip must not trigger one.

## The digest job survives a bad send (R4)

Recipients ran in `Promise.all` chunks of ten and `sendEmail` threw on any
non-OK Resend response with no retry — one failure aborted the whole run. The
trigger was never going to be a bad address: **Resend's default limit is 2
requests/second** and we fired ten at once.

Two layers now:

- `email.ts` paces every send in the process through one chain
  (`RESEND_MAX_RPS`, default 2) and retries 429/5xx and network errors with
  backoff, honouring `Retry-After`. Permanent 4xx never retries — a bad address
  will not become good.
- The job isolates each recipient: failures are logged
  (`component=digests`), counted, and stepped over. Nothing is lost, because
  per-forum watermarks only advance once an email is actually out.

The response carries `failed`, and `run-digests.yml` now fails the workflow on
it — otherwise a cohort-wide delivery failure showed as a green run.

## Draining, alerting, backups

- **SIGTERM/SIGINT draining** in `index.ts` with a 10s backstop (R10). Every
  deploy sends SIGTERM; in-flight requests used to be dropped.
- **DigitalOcean alerts declared in the dev app spec** (R6):
  `DEPLOYMENT_FAILED`, `DOMAIN_FAILED`, and `RESTART_COUNT` on the API. Zero
  dependencies, no account to create. Mirrored to `app.yaml` once dev proves
  the spec is accepted.
- **`scripts/backup-db.sh` + `backup-db.yml`** (R8): weekly `pg_dump -Fc` to a
  private bucket, integrity-verified with `pg_restore --list` before upload,
  pruned by the timestamp in the key. **Inert until Ed provisions the bucket
  and secrets.** It cannot be a GitHub artifact — this repo is public, so
  artifacts are publicly downloadable, and the dump holds every email address
  and comment.

## Policy, not code

`CLAUDE.md` now carries the **term-time migration rule: additive only** while a
programme is running. Migrations run PRE_DEPLOY and a code rollback does not
roll back the schema, so additive-only is what makes a deploy reversible.
