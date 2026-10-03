# Web Push — plan (#368)

Written 2026-10-03 for Ed to decide from. Plan only: no code has been
written for this yet. Source material: AndreasThinks's #360 (not merged; Ed,
2026-10-02: "build #360's ideas separately ourselves"), the review findings
recorded in #368, and the installable-app request #367.

**In one paragraph.** Members can switch on phone/desktop alerts, per forum,
on each device they choose. An alert says only "Topic — You have new
activity"; tapping it opens their notifications. An alert fires for exactly
what already raises the unread badge on the Notifications page. Delivery
happens **inside the API, seconds after the event**: the request that posts
a comment flags the recipients' devices, and the API sends the alert just
after replying. A one-minute sweep in the same process catches anything the
fast path missed. There is no new server, no scheduler, and no monthly cost.
Ed's part is to create two key pairs (dev and production), add them as
GitHub environment secrets, and answer the four questions in §5.

---

## 1. What members would get

### In their words

- On a forum's **Notifications** page there is a card: "Get an alert on this
  device when something needs you." One button: **Turn on alerts**. The
  browser asks for permission then, and never on page load.
- The switch is **per forum and per device**. Turning it on on a phone does
  not turn it on on a laptop. Turning it on for one forum does not turn it on
  for another. Turning it off on this device leaves other devices alone.
- When something happens, the device shows a notification titled **Topic**
  that reads **"You have new activity."** It shows nothing else.
- Tapping it opens Topic. Someone in one forum lands on that forum's
  Notifications page. Someone in several forums gets a short "which forum?"
  list. In both cases they sign in first if needed.
- Several things in a row produce one notification, not a stream. All alerts
  share a single tag, so a new alert replaces the old one, and each device
  gets at most one buzz every two minutes.
- Email digests and the in-app pane are unchanged. Turning alerts on doesn't
  change them, and changing them doesn't affect alerts.
- **iPhone/iPad:** the card appears only once Topic is installed on the Home
  Screen (#367; see §3.4). Until then it explains how to install.

### Which events alert: the badge rule

**An alert fires when the unread badge on the Notifications page would go
up.** The pane is built by `listNotifications` in
`packages/core/src/notifications.ts`, and the sender asks that same function.
So alerts can never drift from what the pane shows.

| Pane entry (`NotificationItem.kind`) | What happened | Alerts? |
|---|---|---|
| `comment` | someone commented on your topic, in any thread you can see (public, {host}-only, drafting) | yes |
| `reply` | someone replied to your comment | yes |
| `mention` | someone @mentioned you in a topic comment or reply | yes |
| `session_pencilled` / `session_confirmed` / `session_cleared` | a session was pencilled, confirmed or cleared on a topic you ❤️'d | yes, only while the forum's calendar is on |
| `sent_back_to_drafting` | an admin moved your ready draft back to drafting (sent-back-notice) | yes |
| `lounge_reply` / `lounge_mention` | a reply to your {host} Lounge post, or a Lounge post that @mentions you | **Ed's decision 1** (recommended: yes) |

What never alerts: your own actions; hidden or deleted comments; anything in
a forum where you are deactivated or no longer a member; anything older than
the moment you switched alerts on; anything you have already seen in the
pane, because the `lastSeenNotificationsAt` watermark counts.

**A change from #360.** #360 alerted only for public threads on published
topics. That would have dropped the drafting-thread and sent-back alerts,
which are the ones hosts most need. The restriction existed to keep content
private. Because alerts carry no content (see the next section), the
restriction isn't needed. The badge rule replaces it.

### Why alerts carry no content

Notifications appear on **lock screens**, in notification centres, on
watches, and on screens being shared in a meeting. Anyone near the device
can read them without unlocking it. Topic holds content that must not leak
that way: drafting threads, {host}-only comments, the Lounge, private
forums, and names of people in all of these.

So the push itself is **empty**: a data-less push with no payload. The
service worker always shows the same fixed sentence, and the content
appears only after the person opens Topic and signs in. This has three
further benefits:

- No payload encryption library is needed. #360 signs with Node's own
  crypto.
- Nothing private passes through Google's, Apple's, Mozilla's or
  Microsoft's push servers.
- An alert queued just before someone was removed from a forum reveals
  nothing, because opening it still checks access.

The cost is a vaguer alert: it doesn't say who or which forum. A later
version could add the forum name as an opt-in, but this plan doesn't
propose it.

---

## 2. What to reuse from #360, and what to change

Fetch with `git fetch origin pull/360/head:pr-360`. Bring over only the push
files. #360 also carries a forum guide page, a source-code link in the
sidebar, and CLAUDE.md/README edits. Those are separate ideas and stay out.

### Reuse largely as-is

| #360 file | Keep | Change |
|---|---|---|
| `packages/db/src/schema/push.ts`, `drizzle/0045_web_push.sql` | the `push_subscriptions` table: membership FK with cascade on removal, endpoint, unique (membership, endpoint) | **regenerate** with the next free migration number (0045 today; main ends at 0044, check `ls packages/db/drizzle` at build time). Add `pending_at`, `claimed_at` and `last_sent_at` (all nullable timestamptz) and an index on `pending_at`. Additive only (R11). |
| `apps/web/public/sw.js` | no fetch handler, no cache, fixed text, fixed same-origin click target, ignores any payload | none |
| `apps/api/src/push-transport.ts` | `validPushEndpoint` (host allowlist, HTTPS, no port/credentials/fragment); `vapidAuthorization` (RFC 8292 ES256 via `node:crypto`); `sendPush` (empty POST, `TTL: 300`, 5 s deadline, never logs the endpoint, 404/410 → `gone`) | see Edge and boot-time checks below |
| `packages/core/src/push.ts` `managePush` | advisory-lock endpoint ownership (a shared browser can't be silently moved to another account); 10-device cap per membership; sanitised errors (Drizzle messages can carry the endpoint) | add the action limit (below) |
| `packages/shared/src/push.ts` | n/a | **replace** `pushTopicCandidates` with the badge rule: count entries newer than the watermark, and drop session kinds when the calendar is off |
| `apps/web/src/components/PushSettings.tsx`, `lib/push.ts` | permission only on click, iOS-not-installed detection (including iPads that report as Macs), "denied" explained without re-prompting, hidden in admin previews | hide when unconfigured (below); copy says ❤️/forum per CLAUDE.md naming |
| `apps/web/src/app/(app)/notifications/page.tsx` | authenticated "choose a forum" landing | one-forum shortcut (below); alias the query back to internal names (`timetable: forum`) per CLAUDE.md |
| `apps/web/next.config.ts` | `no-cache` header on `/sw.js` | none |
| `docs/WEB_PUSH.md` | browser limitations, privacy, verification steps | rewrite the scope, operational-limits and setup sections to match this plan |
| tests (`push-transport.test.ts`, `push-send.test.ts`, `PushSettings.test.tsx`, `lib/push.test.ts`, `shared/push.test.ts`) | most cases | move the core tests (below) |

`apps/web/src/app/manifest.ts` and the icons belong to **#367** and ship in
that PR. One note for it: #360's `start_url` is `/timetables`, which is
right because it is the signed-in home.

### Change: the review findings from #368

1. **Never show an unconfigured card.** `PushSettings` renders nothing when
   the GraphQL `pushPublicKey` field is null. #360 showed the card and then
   failed with a 503 on Enable. `pushPublicKey` already returns null when the
   keys are missing or during view-as. Keep that, and gate the card on it.
2. **Deactivation pauses and never deletes.** #360's `deliverOne` deletes
   the subscription when `member.deactivatedAt` is set. That is wrong because
   member-deactivation is reversible. Instead:
   - the sender **skips** deactivated memberships and leaves their rows;
   - `reactivateMembership` in `packages/core/src/members.ts` stamps
     `last_checked_at = now()` on that membership's subscriptions, so the
     first alert after reactivation doesn't replay the time away. This
     mirrors how reactivation stamps `lastDigestAt`.

   Removal still cascades through the FK, which is correct: re-joining
   needs a fresh opt-in.
3. **No HTTP send inside a database transaction.** #360's `deliverOne`
   holds `SELECT … FOR UPDATE` open across `send()`, which is up to 5 s per
   device with a pool of 10 connections (R17). Replace it with
   **claim → commit → send → update**:
   - claim with `UPDATE push_subscriptions SET claimed_at = now() WHERE id =
     … AND (claimed_at IS NULL OR claimed_at < now() - interval '2 minutes')
     RETURNING …` (one statement, no open transaction);
   - send with no connection held;
   - then a second statement sets `last_sent_at` / `last_checked_at`,
     clears `pending_at` and `claimed_at`, or deletes on `gone`.
4. **Edge.** Accept Microsoft's push service. In `validPushEndpoint`, add
   `host.endsWith(".notify.windows.com")` alongside `.push.apple.com`.
   Suffix match on the full label, so `evilnotify.windows.com` fails. Test
   both cases. Edge is common on institutional Windows machines, so
   refusing it would be a visible gap.
5. **Rate limit on subscribe.** Add `pushSubscribe: { windowMs: 60 *
   60_000, max: 30 }` to `ACTION_LIMITS` in `apps/api/src/http/action-limits.ts`,
   with a `BLOCKED_MESSAGES` entry, and check it in the subscribe route
   before `managePush`. The 10-device cap limits how many rows a member can
   hold. The rate limit limits how fast they can churn them.
6. **Key check once at boot.** #360's `pushConfig()` re-derives and compares
   the key pair on every call, including on each send. Move validation into
   `apps/api/src/env.ts` next to the `SPACES_*` block and expose a frozen
   `env.push` (or null). §3.1 has the rule.
7. **Package boundaries.** #360 widened `apps/api/tsconfig.json` `rootDir`
   to `../..` so an api test could import core's source by relative path.
   Revert that. `push-core.test.ts` imports from `@timetable/core` like the
   rest of api's tests. Pure logic, like the badge rule, sits in
   `packages/shared` with its own vitest file.
8. **One-forum shortcut.** `/notifications` redirects straight to
   `/f/<slug>/notifications` when `myForums` has exactly one entry. Keep the
   chooser for two or more. With none, go to `/timetables`.
9. **Lounge.** `listNotifications` only includes Lounge kinds when
   `opts.lounge` is true. The sender passes the same gate the GraphQL
   resolver uses, `seesLounge` in `apps/api/src/graphql/activity.ts` (shared
   `canUseLounge` + `isLoungeEnabled`), evaluated at send time. Lift that
   helper into core or shared so the resolver and the sender share it. If
   Ed answers no to decision 1, pass `lounge: false`.

### Replace: the sender

#360's `deliverPush` walks **20 devices per run**, oldest first, and
re-reads each one's notification list. With a scheduler calling it every few
minutes, an alert at 100 devices can take **25+ minutes** (#368). §3.2
replaces this with an event-driven sender. `deliverOne`'s re-checks are
kept: membership, deactivation, forum readability, calendar on/off, and the
pane watermark.

---

## 3. Hosting

### 3.1 VAPID keys

**What they are.** A VAPID key pair identifies *our server* to the browser
push services. When someone turns alerts on, their browser receives our
public key and locks the subscription to it. From then on, Google, Apple,
Mozilla and Microsoft accept a push for that subscription only when it is
signed with our private key. A leaked private key would let someone else
send our members empty "You have new activity" buzzes, but no content,
because there is none. Losing or **rotating** the key silently breaks every
existing subscription, and everyone would have to turn alerts on again.
**Generate each key once per environment and never rotate it casually.**

There are three values per environment:

| Variable | Secret? | Notes |
|---|---|---|
| `VAPID_PUBLIC_KEY` | no (sent to browsers) | base64url, uncompressed P-256 point |
| `VAPID_PRIVATE_KEY` | **yes** | base64url, 32 bytes |
| `VAPID_SUBJECT` | no | `mailto:` or `https://` contact the push services can use to reach us |

Dev and production get **different** pairs. Dev subscriptions must never be
valid against production.

**Where they live**, following the `SPACES_KEY` / `SPACES_SECRET` pattern:

1. GitHub environment **secrets** `VAPID_PRIVATE_KEY`, `VAPID_PUBLIC_KEY`,
   `VAPID_SUBJECT` in `timetable-dev` and `production`. All three are kept as
   secrets for simplicity, even though only the private key needs to be one.
2. `deploy-dev.yml` and `deploy-production.yml` pass them through in the
   `digitalocean/app_action` `env:` block. This is a code change in a PR,
   done by a builder.
3. `.do/app.dev.yaml` and `.do/app.yaml` list them on the **api**
   component: `{ key: VAPID_PRIVATE_KEY, value: "${VAPID_PRIVATE_KEY}",
   scope: RUN_TIME, type: SECRET }`, and the same for the other two.
4. `.env.example` documents them, and `DEPLOYMENT.md` adds them to the env
   table and the secrets list.

The web component needs none of these. It reads the public key through
GraphQL `pushPublicKey`.

**The boot-time rule** (in `env.ts`, once):

- **None set** → push is off. The card is hidden, subscribe returns 503, and
  the sender is idle. This is the default everywhere until Ed adds keys.
- **All three set and valid** → push is on. "Valid" means the subject is
  `mailto:`/`https://`, both keys decode to the right lengths, and the
  public key is derived from the private key.
- **Partial or invalid** → in production the API **refuses to boot** with a
  message naming the problem, like `SPACES_BUCKET` without its key. DO then
  fails the deploy, the previous deployment stays live, and the
  `DEPLOYMENT_FAILED` alert (R6) emails Ed. Outside production it logs a
  warning and push is off.
- **Empty strings count as unset.** A spec placeholder whose secret is
  missing resolves to `""`, and that alone must not take the API down. The
  SPACES rule bit this way (PR #72). So if all three are empty, push is
  off, with no error.

One extra env var, `PUSH_PAUSED=true`, works as a **kill switch**: the card
stays, but nothing is sent. Ed can set it in the DO console on the api
component. It takes effect on the component restart with no deploy, the
same lever as `RATE_LIMIT_MAX` in the incident runbook.

### 3.2 The sender schedule

The question is what makes the API send an alert after someone posts.
Today's context: one API instance (`instance_count: 1`, R10), a 0.5 GB box,
a 10-connection database pool (R17), and a cohort of tens to low hundreds.

| | Typical delay | Reliability | Cost | Notes |
|---|---|---|---|---|
| **(a) DO App Platform scheduled job** | 1–2 min (cron granularity + a container cold start per run) | good; DO runs it, not GitHub | each run boots a container billed per second. At once a minute it is close to an always-on extra instance (≈$5/month at the smallest size) | Newer App Platform specs accept a job with a cron schedule (`kind: SCHEDULED`). **Not verified from this session.** Confirm against the current DO app-spec reference before relying on it. The job would POST `/api/jobs/push` with `CRON_SECRET` or run a script against the DB. That adds a fourth component to both specs and to the deploy workflows. |
| **(b) In-process interval timer in the API** | ≤ 60 s | as reliable as the API itself. It stops when the API is down, but alerts are pointless then anyway, and it restarts with the process | $0 | simple at one instance. **At `instance_count: 2`** both instances tick: claim-by-UPDATE (§2 item 3) stops a device getting two sends, and a `pg_try_advisory_lock` around each sweep stops both from doing the work. Each deploy restart pauses it briefly. |
| **(c) GitHub Actions cron** | ≥ 5 min nominal; often 10–30+ min | **poor**: best-effort, drops runs under load, and GitHub disables it after 60 days without commits (R12) | free | The digest already depends on this trigger and it is in OPERATIONS.md's queue as a known weakness. Adding a real-time feature to it would repeat the mistake. |
| **(d) Inline, at the event** | **seconds** | the fast path is lost if the process dies mid-send; see the outbox below | $0 | no scheduler at all. Assessed below. |

#### (d) assessed properly: sending inline

**Where the hooks go.** Four places create pane entries:

- `addComment` in `packages/core/src/comments.ts` (comments, replies,
  @mentions in either);
- the post and reply writes in `packages/core/src/lounge.ts`;
- the slot mutations that log `slot.pencil` / `slot.confirm` / `slot.clear`
  in `apps/api/src/graphql/slots.ts`;
- the `topic.unready` write in `setTopicReady`
  (`packages/core/src/topics.ts`), for send-backs.

Each one names its **candidate recipients**, a cheap superset:

- comment: topic host, parent author, mentioned users;
- Lounge: parent author, mentioned users;
- session: the topic's ❤️-ers;
- send-back: the host.

The authoritative "does this person have something new?" check is still
`listNotifications` at send time. A sloppy candidate list can cause a
missed alert, but never a wrong one.

**Latency.** Seconds: one database round trip plus one HTTPS POST per
device, typically well under a second.

**Request time.** Nothing is added that a user waits on. The handler commits
its own write, sends its response, and only then starts the push work
(`setImmediate`, not awaited). The one thing done before responding is the
durable flag, described next.

**Durable outbox vs fire-and-forget.** Pure fire-and-forget loses alerts
silently when the process restarts mid-send, which happens on every deploy
at one instance. A full outbox table (one row per event) is more machinery
than this needs. The middle path costs one indexed statement:

> **The flag is the outbox.** After the event commits, run `UPDATE
> push_subscriptions SET pending_at = now() WHERE pending_at IS NULL AND
> membership_id IN (candidates in this forum)`. That is one statement,
> usually zero to three rows, and a few milliseconds. The async sender then
> claims and sends those rows. If the process dies first, the flag
> survives, and the **sweep** picks it up.

This works because the notifications pane is itself the durable record of
*what* happened. The flag only has to remember *who to check*. Two
consequences: re-sending is harmless, because the watermark check finds
nothing new and skips; and a lost flag costs at most one buzz, never data.

**Failure isolation.** Push failures can't fail the request: the work runs
after the response, inside a try/catch that logs without the endpoint.
Push-service slowness can't pile up, for three reasons:

- sends go through a small concurrency limiter (4 in flight);
- each send has #360's 5 s hard deadline;
- no database connection is held during a send (§2 item 3).

A burst of 30 comments flags at most a few dozen rows. The per-device
2-minute gap (`last_sent_at`) turns a burst into one buzz, and the sweep
delivers the leftovers.

**Rate limits.**
- **Ours:** the comment action limit (12/min/user) already caps how much
  fan-out one account can trigger. Sends are outbound, so the inbound
  per-IP limiter isn't involved.
- **Theirs:** FCM, Mozilla, Apple and WNS allow far more than a forum
  generates. A 429 or 5xx from them is treated as `retry`: the flag stays,
  and the sweep tries again in a minute.
- **The fan-out worst case** is a session confirmed on a topic with 80 ❤️s,
  which means 80 candidates. Each needs a `listNotifications` check, about
  four queries. That is around 320 short queries spread over a few seconds
  behind the limiter, acceptable at this size. If it ever isn't, the first
  optimisation is a cheap "anything newer than the watermark?" count in
  place of the full list. `countUnreadNotifications` already exists.

#### Recommendation: (d) + (b), one mechanism

**Send inline, and back it with a one-minute in-process sweep.** Both run
in the API and call the same `deliverPending()`:

- **Fast path:** the event sets `pending_at` on candidates, and the API sends
  right after responding. Alerts arrive in seconds.
- **Sweep:** every 60 s, the API claims rows with `pending_at` older than a
  minute (missed by a crash or deploy) or that came back `retry`, and sends
  them. This is a `setInterval` started in the API's boot, stopped in the
  existing SIGTERM drain, and wrapped in `pg_try_advisory_lock` so a second
  instance would skip rather than duplicate.

This is (d)'s latency with (b)'s safety net, and nothing outside the API.
No new DO component, no GitHub cron, and nothing to keep alive when the
repo goes quiet (R12, R16).

Leave out (a) for now. It is only worth adding if the API ever stops being
a long-running process. Leave out (c) entirely.

**If `instance_count` becomes 2 (R10):**
- the fast path runs on whichever instance served the request;
- the sweep runs on whichever instance takes the advisory lock;
- claim-by-UPDATE makes each device's send exclusive;
- the pool budget (R17) still holds, because nothing holds a connection
  during a send.

### 3.3 Nothing else changes on the infrastructure side

- **No DNS, CDN or object storage changes.** `/sw.js` is a static file from
  the web component.
- **CSP:** the service worker is same-origin. The browser contacts the push
  service itself, not the page, so `connect-src` needs nothing new. Verify
  on dev all the same.
- **No new outbound firewall rules.** The API already makes outbound HTTPS
  calls (to Resend and Clerk).

### 3.4 iOS and the installable app (#367)

Apple allows web push **only for a web app installed on the Home Screen**
(iOS/iPadOS 16.4+), and only when opened from that icon. A Safari tab
cannot subscribe at all. So:

- **#367 ships first.** Its manifest (`name: "Topic"`, `display:
  "standalone"`, 192/512 icons) is what makes "Add to Home Screen" produce a
  real app. Push without #367 works on Android, Windows and Mac, but never
  on iPhone.
- **The card adapts.** In Safari on iPhone, `lib/push.ts`'s detection
  replaces the button with short instructions: "Share → Add to Home Screen,
  then open Topic from your Home Screen and turn alerts on here." Opened
  from the installed icon, the normal button appears.
- **Installed is a separate browser profile.** The Home Screen app has its
  own storage and its own Clerk sign-in. Members will need to sign in once
  inside the installed app, and the docs and card copy should say so.
- **Whether to nudge people to install**, beyond the push card, is
  decision 3.
- **Desktop Safari** (macOS 13+) and **Android** need no installation.

---

## 4. Rollout

### Order of events

1. **Builder PRs land on `main`** (§6). Everything ships **inert**: with no
   keys, the card is hidden and the sender idles. So nothing changes for
   anyone when this reaches dev or production.
2. **Ed creates the dev key pair and adds the dev secrets** (see "Ed's part"
   below).
3. **Next dev deploy** (any merge, or a manual `Deploy Dev` run) picks the
   keys up. A builder then verifies on dev:
   - opt in on Android Chrome, desktop Chrome/Firefox/Edge, and macOS Safari;
   - a second seeded user posts a qualifying comment, and the alert arrives
     in seconds;
   - lock the screen and check it shows only the fixed text;
   - tap → the one-forum shortcut lands on the forum's Notifications page;
   - deactivate, comment, see no alert; reactivate, and the backlog does
     not replay;
   - remove the membership, and the row is gone;
   - set `PUSH_PAUSED`, comment, see no alert.
4. **iPhone check on dev** needs a real iPhone with Topic installed. Ed's
   own phone, or a tester's.
5. **Ed creates the production key pair, adds the production secrets, and
   runs `deploy-production.yml` himself** (agents never deploy production).
6. Optionally, Ed tells members in the next digest or in person.

### How Ed turns it on and off

- **Per environment, on:** add the three secrets, then deploy. Keys present
  means the feature exists.
- **Per environment, paused:** `PUSH_PAUSED=true` on the api component in
  the DO console. Subscriptions are kept and resume when unset.
- **Per environment, gone:** remove the secrets and redeploy. The card
  disappears. Subscriptions stay in the database, harmless, and work again
  if the *same* keys come back.
- **Per person:** each member's own switch, per forum and device.
- **No per-forum admin switch in v1.** Nothing is pushed unless a person
  asks for it on their own device, so there is nothing for an admin to
  protect members from. A Forum Settings toggle is easy to add later if a
  forum wants alerts unavailable altogether.

### Ed's part (only he has repo-settings and DigitalOcean access)

Agents never touch repo settings, GitHub secrets, or DO infrastructure.

1. **Generate two key pairs**, one for dev and one for production. Run this
   on your own machine in the repo:
   `node scripts/generate-vapid.mjs` (a builder ports #360's 7-line script).
   It prints two lines. The `PRIVATE` line is a secret: paste it straight
   into GitHub, and don't save it to a file, ticket or chat.
2. **Add the secrets** in GitHub → Settings → Environments:
   - `timetable-dev` gets the dev pair;
   - `production` gets the production pair;
   - each environment gets `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and
     `VAPID_SUBJECT`. For the subject, use a `mailto:` address you're happy
     for Google, Apple, Mozilla and Microsoft to see; they would use it only
     to contact us about abuse.
3. **Keep a private copy** of the production private key in your password
   manager. Losing it means everyone has to re-enable alerts.
4. **Deploy production** when ready, by running `deploy-production.yml`.
5. **Test on an iPhone** once on dev.

### Migration

One new table, `push_subscriptions`, plus its index. It is **additive only**
(R11): nothing existing is altered, so a code rollback leaves a harmless
unused table. Take the next free number at build time (0045 today).

---

## 5. Decisions for Ed

Recommended option first in each.

1. **Lounge alerts.** Lounge replies and @mentions already appear in the
   pane and raise the badge for hosts and admins. Alerts carry no content,
   so nothing about the Lounge leaks.
   - **(A) Include them under the same switch** (recommended): no extra UI,
     and alerts match the badge.
   - (B) Leave them out: one line of code, but the badge and alerts
     disagree for hosts.
   - (C) A separate Lounge alerts toggle: about +2 builder-hours, and a
     second switch to explain.
2. **Delivery approach.**
   - **(A) Inline at the event, plus a one-minute sweep inside the API**
     (recommended): alerts in seconds, $0, no scheduler to keep alive.
   - (B) Sweep only, inside the API: up to a minute's delay, $0, slightly
     less code.
   - (C) A DigitalOcean scheduled job: 1–2 min delay, about $5/month, a new
     component in both app specs, and spec support still to be confirmed.
   - (D) A GitHub Actions cron: 5–30+ min delay, free, unreliable (R12).
     Not recommended.
3. **Prompting iPhone users to install.** iPhones need Topic on the Home
   Screen before alerts work (#367).
   - **(A) Explain it only on the alerts card**, where push is offered
     (recommended): no new UI, and people who want alerts find out exactly
     when they need to.
   - (B) Also show a dismissible "Install Topic" banner to iPhone Safari
     visitors: about +3 builder-hours, and it reaches more people, but it
     nags everyone, including people who don't want alerts.
   - (C) Don't mention it: zero cost, but iPhone users see a card that does
     nothing.
4. **Opt-in granularity.**
   - **(A) Per forum, per device**, as in #360 (recommended): the switch
     lives on each forum's Notifications page, membership is the privacy
     boundary, and members of one forum (most people) see no difference.
   - (B) One switch per device covering all your forums: simpler for
     multi-forum people, but forums joined later need a rule (auto-include
     or not), and the switch needs a home outside any forum. About +2
     builder-hours.
   - (C) Per forum, one switch for all your devices: devices still have to
     subscribe one by one in the browser, so this is confusing and not
     recommended.

---

## 6. Effort and build order

Estimates are builder-hours including tests, review fixes and the
execution-journal entry. Each step is one PR, merged in order. Each ships
inert until keys exist.

| # | PR | Contents | Hours |
|---|---|---|---|
| 0 | **#367 installable app** (prerequisite, its own issue) | manifest, 192/512 icons, Apple touch icon and meta | 2–3 |
| 1 | **Push data + subscribe** | migration (next number) + `schema/push.ts`; core `managePush` with the advisory locks and device cap; shared badge-rule helper with tests; reactivation stamp in `members.ts`; core tests via `@timetable/core`, with `rootDir` untouched | 4–5 |
| 2 | **API config + transport + routes** | `env.ts` VAPID boot rule and `PUSH_PAUSED`; `push-transport.ts` with the Edge host added; `POST /api/forums/:slug/push-subscriptions` with the `pushSubscribe` action limit; GraphQL `pushPublicKey` + `myPushEnabled`; spec, workflow and `.env.example` entries (inert without secrets) | 4–5 |
| 3 | **Sender** | `pending_at` flagging at the four event sites; `deliverPending` (claim → commit → send → update, 4-way limiter, 2-min per-device gap, Lounge gate per decision 1); 60 s sweep with advisory lock, started at boot and stopped in the SIGTERM drain; tests for skip-when-deactivated, retry, gone, double-claim | 6–8 |
| 4 | **Web** | `sw.js` + no-cache header; `PushSettings` card on `/f/[slug]/notifications`, hidden when unconfigured, iOS copy per decision 3; `/notifications` chooser with the one-forum shortcut; jsdom tests after `QueueControls.test.tsx` | 5–6 |
| 5 | **Docs** | `docs/WEB_PUSH.md` (adapted from #360); `DEPLOYMENT.md` env table + secrets; `OPERATIONS.md` note (kill switch, key-loss consequence); `ARCHITECTURE.md`; a CLAUDE.md glossary entry | 2 |
| 6 | **Dev verification** (no PR) | the §4 checklist on real devices; iPhone with Ed or a tester | 2–3 |

**Total: about 23–29 builder-hours for push, plus 2–3 for #367.** Decisions
1(C), 3(B) or 4(B) each add the hours noted against them.

Steps 1 and 2 can be built in parallel. Step 3 needs both. Step 4 needs
step 2's GraphQL fields. Step 5 can trail step 4 by a day.
