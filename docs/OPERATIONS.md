# Operations & Reliability Plan

Written 2026-08-21, ahead of running a real programme on Topic.

This is the **infrastructure** risk register — the ways the system stops
working, loses data, or fails silently. Product risk is out of scope
(`docs/PRODUCT.md`). Deploy mechanics live in `docs/DEPLOYMENT.md`; this
document is about what happens when they go wrong.

Status key: **DONE** · **IN PROGRESS** · **NEEDS ED** (requires a decision,
an account, or credentials only Ed can supply) · **LATER**

---

## The two structural observations

1. **The load profile is about to change discontinuously.** Until now the app
   has been exercised by one or two people and a fixture set. A programme
   creates _synchronised_ behaviour — everyone opens the digest at 08:20,
   everyone checks the calendar the night before a deadline. Software that is
   fine at 30 average users can still fall over at 30 simultaneous ones. Most
   findings below are a variant of this.

2. **Excellent documentation, almost no instrumentation.** `DEPLOYMENT.md` is
   better than most funded startups'. But every bit of it helps a human act
   _once they already know_ something is wrong. Nothing in the system has the
   job of saying "something is wrong". That asymmetry is the largest gap and
   the cheapest to close.

---

## Risk register

### R1 — The hosted rate limiter is misconfigured and effectively inert · **DONE**

**Measured, not inferred** (2026-08-21, against `dev.timetable.love`).
Eight identical `POST /graphql` requests from one client, forced onto IPv4,
came back attributed to **four different buckets** — `ratelimit-reset` values
of 412, 434, 435 and 458 interleaving, with `ratelimit-remaining` moving
non-monotonically (299, 299, 297, 297, 297, 298, 296, 296).

The store is not at fault: `bucketKey` is the primary key of
`api_rate_limit_buckets`, so the upsert in `rate-limit.ts` is correct. The
scatter is at the _key_ level, which means `req.ip` genuinely varies per
request. `TRUST_PROXY_HOPS=1` is landing Express on a **DigitalOcean edge
proxy address from a rotating pool**, not on the client.

Consequences, in order of importance:

- **No effective protection.** A scraper, a runaway client loop, or an abusive
  user has their traffic spread across the proxy pool and never fills a bucket.
  The API is currently unprotected.
- **Innocent users can still be throttled.** The buckets belong to _shared
  proxies_, so they fill from aggregate traffic. Whoever next lands on a full
  proxy gets a 429 — arbitrarily, and with no relation to their own behaviour.
  This is strictly worse than per-IP limiting.
- **You pay the cost and get none of the benefit.** Every request is a Postgres
  upsert, and each newly-seen proxy address inserts a row.

This supersedes the earlier code-reading prediction that server-side rendering
would collapse into a single shared bucket. It does not — SSR traffic scatters
across the same pool. The failure mode is inversion (no limiting), not
concentration.

**Cause, measured.** A forwarding diagnostic was shipped to hosted dev
(`DEBUG_FORWARDING=true`, dev spec only) and reported:

```json
{
  "ip": "172.70.46.137",
  "ips": ["172.70.46.137"],
  "xForwardedFor": "2a01:4b00:b608:3100:19bf:a36f:866:b3e3,172.70.46.137",
  "trustProxyHops": 1
}
```

`172.70.46.137` is **Cloudflare**. DigitalOcean App Platform is itself fronted
by Cloudflare — every `*.ondigitalocean.app` response carries a `CF-RAY` header
and `Server: cloudflare`, on `topic.forum` as well as dev. So the real chain is
**client → Cloudflare → DigitalOcean → Express**, and the header carries
`<real client>, <cloudflare edge>`.

Express counts trusted hops from the **right**, so at `TRUST_PROXY_HOPS=1` it
resolved `req.ip` to the Cloudflare edge address — which rotates per request
across Cloudflare's fleet. Hence the scatter.

**Fixed:** both app specs now set `TRUST_PROXY_HOPS=2`, which resolves `req.ip`
to the real client. Counting from the right is also what keeps this
spoof-resistant: a client injecting their own `X-Forwarded-For` only pushes
entries further left, while Cloudflare appends the true client IP to the right
of them.

**The consequence of fixing it — read this before touching the limit.** Making
per-IP limiting real re-arms the concentration risk: server-side rendering
fetches the API over the public URL (`transport.ts` → `NEXT_PUBLIC_GRAPHQL_URL`
→ `${APP_URL}/graphql`), so **every server-rendered page view in the entire
forum arrives from one address** — the web container's egress. At the old
300/min that would have 429'd everyone simultaneously at the busiest moment,
which is the failure the original code reading predicted.

`RATE_LIMIT_MAX` is therefore raised to 6000/min in both specs. That still
bounds a scraper, and per-user write budgets (`http/action-limits.ts`, keyed by
user id) remain the real abuse protection. The number is a judgement call
rather than a measurement, and the way to remove the guesswork entirely is the
structural fix — SSR talking to the API internally instead of round-tripping
through the public hostname (task 13).

**Verified on hosted dev after deploy** (2026-08-21). `req.ip` now resolves to
the real client, and eight rapid requests decrement a single bucket
monotonically — 5999, 5998, 5997, 5996, 5995, 5994, 5993, 5992 — against one
stable window, where before they scattered across four. The Cloudflare edge
address also visibly moved between probes (`…137` → `…136`), which is the
rotation that caused the original bug.

### R2 — The rate limiter fails closed · **DONE**

`rate-limit.ts` returned 503 to _every_ request when the bucket store threw.
The limiter fronts both `/graphql` and `/api`, so a transient database wobble
became a total outage rather than a partial one. For a system where
availability matters more than exact limit enforcement, failing **open** —
log, allow, carry on — is the right trade.

### R3 — `/health` never checked the database · **DONE**

`app.ts` returned `{ok: true}` unconditionally. This is the check DigitalOcean
uses to decide whether the API is alive, so Postgres could be unreachable, the
pool exhausted, or the schema broken, and DigitalOcean would see a perfectly
healthy service: no restart, no signal. `DEPLOYMENT.md` even told a human to
follow up with a GraphQL probe — the tell that the check was not doing its job.

Fixed with a `select 1` behind a short timeout. The endpoint stays outside the
rate limiter, and DigitalOcean's failure threshold is set generously so a brief
database blip does not trigger a restart loop on a single-instance service.

### R4 — One bad email killed the entire digest run · **DONE**

`rest/router.ts` processed recipients in `Promise.all` chunks of ten, and
`sendEmail` threw on any non-OK Resend response with no retry. The code comment
acknowledged it: _"one recipient's compute/send throwing still aborts the whole
run."_

The likely trigger was never a bad address — it is **Resend's default rate
limit of 2 requests per second**, against ten concurrent unthrottled sends. The
first run against a real cohort would almost certainly have hit 429 and
aborted. The per-forum watermarks (2026-08-17 audit) made it _resumable_, but
nothing told anyone a re-run was needed.

### R5 — No error monitoring · **NEEDS ED** (decision 1)

No Sentry, no log drain, nothing. Detection today is "someone tells Ed".

Good news found while investigating: `http/request-log.ts` already emits
structured JSON with request ids, stack traces and Postgres error fields. The
logging is done; only shipping it somewhere is missing. Partially mitigated by
R6 without any new dependency.

### R6 — No alerting on deploy or restart failure · **IN PROGRESS**

DigitalOcean App Platform supports alert rules declared in the app spec —
`DEPLOYMENT_FAILED`, `DOMAIN_FAILED`, and per-component `RESTART_COUNT` /
`MEM_UTILIZATION`. Zero code, zero dependencies, no account to create.
Combined with a real `/health` (R3), a flapping API now announces itself.

### R7 — No uptime monitoring · **NEEDS ED** (task 8)

Nothing pings the site. R3 plus R6 covers "the app died"; an external monitor
is still needed for DNS, TLS and load-balancer failures, which are invisible
from inside the app.

### R8 — Backups are untested and single-homed · **IN PROGRESS / NEEDS ED** (task 9)

DigitalOcean managed Postgres takes daily backups with (verify) 7-day
retention. They have never been restored. There is no copy of the database
outside DigitalOcean, and **no backup at all of the Spaces bucket** — every
profile photo and cover image exists in exactly one place.

The scenario to fear is not DigitalOcean losing data. It is a destructive
migration or a mistaken script going unnoticed for three weeks, by which time
the daily backups have rolled past it.

Note: the repository is **public**, so GitHub Actions artifacts are publicly
downloadable. A dump therefore _cannot_ be stored as an artifact — it needs a
private bucket.

### R9 — Production and dev deploy by different mechanisms · **NEEDS ED** (task 5)

Dev runs a pre-built Docker image from the registry (`app.dev.yaml`:
`registry_type: DOCR`). Production builds from source on the box —
`npm ci && npm run build -w @timetable/web` on a 1 GB instance (`app.yaml`).

Two consequences: the artefact QA'd on dev is not the artefact production runs;
and a `next build` that passes in CI can still run out of memory on a 1 GB App
Platform box — as a **deploy-time** failure, at the exact moment you are trying
to ship a fix. Production has never been deployed. The first one exercises this
path, the Clerk production instance, and its DNS, all at once.

### R10 — Single instance, no graceful shutdown · **PARTLY DONE**

Both services are `instance_count: 1`: every deploy is a downtime window, and
the API dropped in-flight requests rather than draining them. SIGTERM draining
is now in place. Running two API instances costs money and is Ed's call
(task 10).

### R11 — Migrations run PRE_DEPLOY and cannot be rolled back · **DONE** (policy)

Not a bug — a policy requirement, now recorded in `CLAUDE.md`: **during term,
migrations are additive only.** Add columns and tables; never drop or rename.
Clean up in the holidays. This makes every deploy rollback-safe.

### R12 — GitHub scheduled workflows are not a reliable cron · **NEEDS ED** (task 11)

The daily digest rides on `run-digests.yml`. GitHub **disables scheduled
workflows after 60 days without repository activity** — very plausible once the
programme is running and commits stop — and scheduled runs are explicitly
best-effort, routinely delayed or dropped under platform load. The digest is a
core habit-forming mechanic riding on the least reliable trigger available.

### R13 — Resend free tier and deliverability · **NEEDS ED** (tasks 2, 3)

Free tier is 100 emails/day, 3,000/month. Daily digests to a cohort cross
100/day almost immediately, and exceeding it produced exactly the abort in R4.

Separately, **sending is not delivering**. A brand-new domain with no
reputation mailing a daily burst to many recipients at one institution is a
textbook spam trigger, and institutional Exchange/Outlook is the hardest
audience there is. This fails _silently_: Resend reports success, nobody
receives anything, and engagement mysteriously never happens.

### R14 — Clerk is a hard dependency with no degraded mode · **NEEDS ED** (task 5)

Clerk down or misconfigured means nobody signs in and nothing works. The
production Clerk instance — separate keys, domains and DNS — has never been
exercised.

### R15 — Account and access single points of failure · **NEEDS ED** (tasks 6, 7)

GitHub, DigitalOcean, Clerk, Resend and the registrar are all one person.
Losing the GitHub account loses the deploy path mid-programme. Domain expiry on
`topic.forum` / `timetable.love` kills the project outright, and kills projects
annually across the industry.

### R16 — Bus factor of one · **ACCEPTED, mitigated by design**

Recruiting a co-maintainer is not realistic in the timeframe. The realistic
mitigation is to **make the system survive neglect**: no scheduled destructive
operations, generous headroom on every quota, and monitoring that comes to Ed
rather than waiting to be checked. Design for the week he has flu.

### R17 — Connection pooling is fine · **NO ACTION**

`max: 10` per instance against managed Postgres's ~22-connection floor.
Recorded because it is the classic first-load killer and Topic does not have
it. Revisit before scaling past two API instances.

### R18 — Barely load-tested · **PARTLY DONE** (task 12)

First concurrency measurement, hosted dev, 2026-08-21: **30 simultaneous
homepage loads** (the full server-rendering path) all returned 200, in 3s wall
clock, with the slowest single response at **2.0s**.

So the app does not fall over at that level — but 2.0s under only 30-way
concurrency, on `apps-s-1vcpu-0.5gb` instances, is not much headroom. Treat 30
concurrent as "works", not as "comfortable", and re-measure before assuming a
larger cohort is fine.

The probe also confirmed the SSR concentration described in R1: those 30 page
loads did not touch the probing client's own rate-limit bucket at all, because
their GraphQL calls arrive from the web container's address.

---

## Priority queue for what remains

Ordered by (likelihood × blast radius) ÷ effort. Everything here needs Ed.

**Before the programme starts — do not skip:**

1. **Decide on error monitoring (R5).** Recommendation: Sentry free tier, API
   first. Needs a yes/no because it adds a dependency, and a DSN only Ed can
   create. About thirty minutes once decided.
2. **Move Resend to a paid tier (R13).** The free 100/day cap will be crossed
   in week one, and crossing it is what breaks the digest.
3. **Test deliverability into a real institutional inbox (R13).** Send to an
   actual Outlook/Exchange address at the institution and confirm it reaches
   the inbox, not junk. Check SPF, DKIM and DMARC alignment.
4. **Rehearse a database restore (R8).** Restore a backup into a scratch
   database and confirm the data is there. Once. Before it is needed. A backup
   never restored is not a backup.
5. **Do the first production deploy now, on a quiet day (R9, R14).** It
   exercises the source-build path, the Clerk production instance and its DNS
   simultaneously. Doing that under pressure is how launches fail.
6. **Check domain auto-renew and the card behind it (R15).**
7. **Print the 2FA recovery codes** for GitHub, DigitalOcean, Clerk, Resend and
   the registrar (R15).
8. **Add an external uptime monitor on `/health` (R7).** A free tier is fine;
   the endpoint is now meaningful.
9. **Provision a private Spaces bucket for backups and add the credentials
   (R8).** The script and workflow are written and waiting; they no-op until
   the secrets exist. It must be private — the repo is public.

**Worth doing, lower urgency:**

10. **Consider `instance_count: 2` for the API during term (R10).** Removes the
    deploy downtime window. Costs money, so it is a judgement call.
11. **Give the digest cron a second trigger, or a weekly "did it run?" check
    (R12).**
12. **Run a real load test before trusting the numbers (R18).**
13. **Make SSR talk to the API internally rather than over the public hostname
    (R1).** Today every server-rendered page view round-trips out through
    Cloudflare and back, and arrives at the API from a single address, so the
    rate limit has to be set generously enough to absorb the whole forum's
    SSR traffic in one bucket. Routing SSR internally would let the per-IP
    limit go back to a tight, meaningful number and would cut a network hop
    off every page render. Needs a decision because it touches
    `lib/transport.ts`, which is load-bearing.
14. **Pre-build the production web image the way dev does (R9)**, so the
    deployed artefact is the tested artefact.

---

## Incident runbook

For "it is 09:00 on a teaching day, something is broken, I have forty minutes."
Work down the list; stop when you find it.

### 1. Establish the blast radius (two minutes)

```bash
curl -sS -w "\n%{http_code}\n" https://topic.forum/health
curl -sS -o /dev/null -w "homepage %{http_code}\n" https://topic.forum/
curl -sS -X POST https://topic.forum/graphql \
  -H 'content-type: application/json' --data '{"query":"query { __typename }"}' \
  -w "\ngraphql %{http_code}\n"
```

| Symptom                                     | Means                             | Go to |
| ------------------------------------------- | --------------------------------- | ----- |
| `/health` returns `{"ok":false,"db":"down"}` | API is up, Postgres is not        | §2    |
| `/health` times out or 5xx                  | API process is down or wedged     | §3    |
| `/health` fine, homepage 5xx                | Web container problem             | §3    |
| `/health` fine, graphql 429                 | Rate limiting (see R1)            | §4    |
| Everything 200 but users complain           | Auth or email                     | §5    |
| Nothing resolves at all                     | DNS, domain or TLS                | §6    |

### 2. Database

Check the `timetable-db-prod` cluster in the DigitalOcean console: is it up, is
it in maintenance, is the disk full? Disk full is the most likely cause of a
sudden total failure and the least likely to be suspected. Resizing is online.

If a migration ran in the last deploy, that is the suspect. Code rollback does
**not** roll back the schema (R11) — either forward-fix or restore.

### 3. Application process

DigitalOcean console → `topic-prod` → the failing component → Runtime Logs.
The logs are structured JSON; filter on `"level":"error"`. Every request
carries a `requestId`, and users can be asked for the `x-request-id` header.

If it is crash-looping, `RESTART_COUNT` alerting (R6) should already have
emailed. Roll back to the previous deployment in the console — this is the
fastest recovery and almost always the right first move. Diagnose afterwards.

### 4. Rate limiting

Until R1 is finished, 429s can hit innocent users because buckets belong to
shared proxies. Emergency lever: raise `RATE_LIMIT_MAX` on the api component in
the DigitalOcean console. It takes effect on the component restart and needs no
deploy.

### 5. Auth or email

- Nobody can sign in → Clerk. Check status.clerk.com and the production
  instance's domain configuration. There is no fallback (R14); if Clerk is
  down, say so and wait.
- Digests did not arrive → check the `Run Digests` workflow run, then Resend's
  dashboard for quota and bounces. The job is resumable: re-dispatch it and
  already-sent forums will not re-send.

### 6. DNS, domain, TLS

Check the registrar for expiry (R15) and the DigitalOcean console for
certificate status. `timetable.love` is an alias of `topic.forum`; if only one
is broken it is a domain-level problem, not an app one.

### Escalation

There is no escalation. That is R16, and the mitigation is that everything
above is written down so it can be done tired.
