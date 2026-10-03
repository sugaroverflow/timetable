# Web Push — plan (#368)

Written 2026-10-03. Ed ruled on its four decisions the same day, and this
version describes the chosen design; §5 lists the rulings and their reasons.
Plan only: no push code has been written yet. Step 0, the installable
app (#367), is built in PR #376. Source material:
AndreasThinks's #360 (not merged; Ed, 2026-10-02: "build #360's ideas
separately ourselves"), the review findings recorded in #368, and the
installable-app request #367.

**In one paragraph.** Members can switch on phone/desktop alerts on each
device they choose. An alert says who, where, and the first line of what
they wrote — "Joshua Becker in Faculty Lounge: but we have infinitely
nesting…" — and tapping it opens that comment or conversation. What alerts
is chosen per forum in the existing "What to include" list on the
Notifications page, which gains a **Push** column beside **Email**: things
aimed at you are on by default, broadcast news is off. The content travels
as an encrypted Web Push payload that Apple and Google can't read. Delivery
is a **once-a-minute sweep inside the API**, so an alert takes up to about a
minute; there is no new server, no scheduler, and no monthly cost. A
**"Get Notifications"** sidebar link appears wherever alerts are possible but
not yet set up on this device, and on an iPhone it shows the Add to Home
Screen steps. Ed's part is to create two key pairs (dev and production),
add them as GitHub environment secrets, deploy production, and test on an
iPhone.

---

## 1. What members get

### In their words

- On a forum's **Notifications** page, the "What to include" list has two
  columns of switches: **Email** and **Push**. Every kind row has both,
  except the one kind with no push event (below).
- Above the list, one line covers **this device**: "Alerts on this device:
  **Turn on**". The browser asks for permission then, and never on page
  load. Once on, it reads "Alerts are on for this device · Turn off".
- The two halves are separate on purpose:
  - **The kind switches are per forum.** They live on the membership like
    the digest switches, so "replies in my threads" can be on in one forum
    and off in another. They follow you to every device.
  - **The device subscription is per device.** Turning alerts on on a phone
    covers all your forums on that phone, and doesn't touch your laptop.
    Turning it off on this device leaves other devices alone.
- An alert reads **"Joshua Becker in Faculty Lounge"** with the first line
  of the message beneath it, trimmed to about 100 characters. Tapping it
  opens the thing itself: the comment's permalink, or the Lounge
  conversation. They sign in first if needed.
- A burst in one thread replaces the earlier alert for that thread rather
  than stacking. Different threads stack, up to three per minute per device;
  beyond that, one "and n more in {forum}" alert opens the forum's
  Notifications page.
- Email digests and the in-app pane are unchanged. The Email column is the
  existing digest switch set; the Push column is new and independent.
- A **"Get Notifications"** link sits in the forum sidebar wherever alerts
  are possible but not yet on for this device (§3.4). On an iPhone or iPad
  browser tab it shows how to add Topic to the Home Screen, which Apple
  requires before alerts can work.

### What an alert looks like

The server builds three fields per alert, plus a tag:

| Field | Built from | Example |
|---|---|---|
| `title` | who + where: the actor's display name in this forum, "in", then the topic title or the forum's Lounge name. People in more than one forum also get " · {forum name}". | `Joshua Becker in Faculty Lounge` |
| `body` | the first non-empty line of the message as plain text (Markdown stripped for Lounge opening posts and topic bodies), trimmed at a word boundary to about 100 characters with "…" | `but we have infinitely nesting…` |
| `url` | the same link the notifications pane builds for that item: topic permalink with `?tab=` naming the tab and `#comment-<id>`, or the Lounge conversation with `?reply=` | `/f/newspeak-2026/lounge?reply=…` |
| `tag` | one per thread (`topic:<id>:<tab>` or `lounge:<rootId>`), so a later alert in the same thread replaces the earlier one | `lounge:9f3c…` |

Kinds without a quoted message use the same shape with fixed wording, for
example `Session confirmed: Housing policy` / `Tue 14 Oct, 18:00 · Room 2`,
or `Ada Lovelace published a topic` / the topic's title. Every alert names
one forum and one item. That is why the old one-forum shortcut on
`/notifications` is gone: the tap goes straight to the item.

**What the service worker shows.** `sw.js` parses the payload, checks that
`url` is a same-origin path (starts with `/`, not `//`), and calls
`showNotification(title, { body, tag, renotify: true, icon, badge, data: {
url } })`. On click it focuses an open Topic window and navigates it, or
opens a new one. If the payload is missing or fails validation, it shows
the fixed "Topic — You have new activity" and opens `/notifications`, which
keeps #360's forum chooser for exactly this fallback.

### Which events alert: the kind map

Each row of `DIGEST_KINDS` (`packages/shared/src/settings.ts`) gets a push
counterpart with its own default, in a new `PUSH_KIND_DEFAULTS` beside
`DIGEST_KIND_DEFAULTS`. The audience rules (`DIGEST_KIND_AUDIENCE`,
`digestKindApplies`) are shared: a row hidden from you for email is hidden
for push too.

**On by default: things aimed at you.**

| Kind (row label) | Push event | Alert |
|---|---|---|
| `comments` — Comments on your topics | a comment on your topic in any thread you can see (public, {host}-only, drafting) | who in {topic}: first line |
| `replies` — New comments in threads you're part of | a comment whose parent is yours, or a new comment in a chain you're part of (`loadChainScope` in `digests.ts`) | who in {topic}: first line |
| `mentions` — Comments that @mention you | a topic comment that @mentions you | who in {topic}: first line |
| `lounge` — Lounge row | a reply to your Lounge post or in a chain you're part of, or a Lounge post that @mentions you. **New conversations don't push**: they are broadcast, and stay in the digest and the nav dot | who in {Lounge name}: first line |
| `sessions` — Upcoming sessions for topics you ❤️'d | a session confirmed or cleared on a topic you ❤️'d (`slot.confirm` / `slot.clear` activity), while the forum's calendar is on | Session confirmed: {topic} / date · room |
| `sessionsHostHearted` — …topics you 💙'd | the same, for 💙 | same |
| `availabilityAsks` — "Can you make it?" asks | a session pencilled on a topic you ❤️'d (`slot.pencil`), while the calendar is on | Can you make it? {topic} / date |

**Off by default: broadcast news.**

| Kind | Push event | Alert |
|---|---|---|
| `commentsHearted`, `commentsHostHearted` — comments on topics you ❤️'d/💙'd | a public comment on such a topic | who in {topic}: first line |
| `hearts`, `hostHearts` — ❤️s / 💙s on your topics | a ❤️ or 💙 given to your topic (`heart_events` ledger, filtered by the active-member-filter) | A new ❤️ on {topic} (no name: who ❤️'d is not shown in this form elsewhere) |
| `newTopics`, `newTopicsHost` — newly published topics | a topic published (`topic.publish`) | who published a topic / {title} |
| `pendingReview` — topics ready to review | a host switches a draft to ready (`readyAt` set) | {host} marked a topic ready / {title} |
| `slotReleases` — new calendar dates | slots released on the calendar | New dates on the calendar / count and range |
| `newMembers` — new members joining | a membership created | {name} joined {forum} |
| `drafts` — draft reminders | **none** (see below) | — |

**The kind with no push event.** `drafts` is a reminder about drafts left
unpublished, computed when the digest runs. Nothing *happens* at a moment,
so there is nothing to alert on. Its Push cell shows a dash, not a switch.
`sessions` is close to this in the digest (an upcoming-sessions list), but
it has a real event in confirm/clear, so it keeps a switch.

**Switch-less admin overrides.** The digest always carries the sent-back
notice (`topic.unready` by an admin, sent-back-notice) with no switch. Push
does the same: while alerts are on for the device, "{admin} moved your topic
back to drafting" alerts in every forum, opening the My Topics card with the
drafting tab.

**Kind defaults the plan filled in.** Ed named the on and off groups; the
rows he didn't name were placed by the same test, aimed at you or broadcast:
`availabilityAsks` and `sessionsHostHearted` on (they are your sessions),
`commentsHearted`, `commentsHostHearted`, `newTopicsHost` and
`pendingReview` off. Flipping any default is a one-line change in
`PUSH_KIND_DEFAULTS`.

**What never alerts:** your own actions; hidden or deleted comments;
anything in a forum where you are deactivated or no longer a member; events
from before the device subscribed; a thread you have already read past (its
`comment_seen` or `loungeSeenAt` mark is newer than the event, for example
because you were reading it live).

### What is on screen, and who can see it

Alerts now carry content, so three things matter.

1. **In transit, nobody but the device can read it.** Web Push payloads are
   encrypted to the browser's own keys (RFC 8291, `aes128gcm`). Google,
   Apple, Mozilla and Microsoft relay the bytes but can't decrypt them; they
   see only the size, timing and endpoint.
2. **On the device, the lock screen decides.** Ed accepted this trade-off.
   iPhones hide notification text on a locked phone by default (Show
   Previews: When Unlocked). Many Android phones and all desktops show it,
   including on a screen being shared in a meeting. The `docs/WEB_PUSH.md`
   page and the Notifications page's alerts line say so in one sentence.
3. **The server checks visibility per recipient at send time.** Drafting
   threads, {host}-only comments and the Lounge can now appear on screens,
   so before building each alert the sweep re-checks, for that person in
   that forum:
   - the membership exists and is not deactivated;
   - the forum is readable to them (private forums);
   - the comment is not hidden or deleted;
   - the thread's visibility is one they can read (`admin_only` drafting:
     the topic's host and admins; {host}-only: hosts and admins);
   - Lounge items: `canUseLounge` + `isLoungeEnabled`, the same gate the
     GraphQL resolver uses (`seesLounge` in `apps/api/src/graphql/activity.ts`,
     lifted into shared so both call it);
   - session kinds: the forum's calendar is on.

   The one window left is between send and display: an alert delivered just
   before someone is removed still shows on their device. The push TTL
   (below) bounds how long a queued one can wait.

**A change from #360.** #360 alerted only for public threads on published
topics, to keep content private while sending none. Per-recipient checks
replace that restriction, so the drafting-thread and sent-back alerts, which
hosts most need, are in.

---

## 2. What to reuse from #360, and what to change

Fetch with `git fetch origin pull/360/head:pr-360`. Bring over only the push
files. #360 also carries a forum guide page, a source-code link in the
sidebar, and CLAUDE.md/README edits. Those are separate ideas and stay out.

### Reuse, with changes

| #360 file | Keep | Change |
|---|---|---|
| `packages/db/src/schema/push.ts`, `drizzle/0045_web_push.sql` | the `push_subscriptions` table and unique endpoint | **regenerate** with the next free migration number (0045 today; main ends at 0044, check `ls packages/db/drizzle` at build time). Key it to the **user**, not the membership (FK to users, cascade on user delete), because the subscription is per device. Add `p256dh` and `auth` (the browser's payload keys, needed to encrypt), `last_sent_at` and `failure_count`. Add the one-row `push_sweep_state` table (§3.2). Additive only (R11). |
| `apps/web/public/sw.js` | no fetch handler, no cache, same-origin click target | **show the payload** as in §1, with the fixed-text fallback |
| `apps/api/src/push-transport.ts` | `validPushEndpoint` (host allowlist, HTTPS, no port/credentials/fragment); `vapidAuthorization` (RFC 8292 ES256 via `node:crypto`); `sendPush` (5 s deadline, never logs the endpoint, 404/410 → `gone`) | add **payload encryption** (RFC 8291 `aes128gcm`: ECDH P-256 + HKDF + AES-128-GCM, all in `node:crypto`, no new dependency), tested against the RFC's worked example. `TTL: 3600`. `Urgency: high` for on-by-default kinds, `normal` for the rest. Payload kept under 3 KB (the limit is 4 KB). Edge host (below). |
| `packages/core/src/push.ts` `managePush` | advisory-lock endpoint ownership (a shared browser can't be silently moved to another account); sanitised errors (Drizzle messages can carry the endpoint) | the 10-device cap is **per user**; store `p256dh`/`auth`; action limit (below) |
| `packages/shared/src/push.ts` | n/a | **replace** `pushTopicCandidates` with `PUSH_KIND_DEFAULTS`, `isPushKindEnabled` and `PUSH_EVENTLESS_KINDS = ["drafts"]`, tested like `settings.test.ts` |
| `apps/web/src/components/PushSettings.tsx`, `lib/push.ts` | permission only on click; iOS-not-installed detection (including iPads that report as Macs); "denied" explained without re-prompting; hidden in admin previews | becomes the **alerts line** above the "What to include" list in `DigestSettingsForm`, hidden when unconfigured; `lib/push.ts`'s detection is shared with the sidebar link (§3.4) |
| `apps/web/src/app/(app)/notifications/page.tsx` | the authenticated "choose a forum" landing | only the service worker's fallback target now, so no one-forum shortcut; alias the query back to internal names (`timetable: forum`) per CLAUDE.md |
| `apps/web/next.config.ts` | `no-cache` header on `/sw.js` | none |
| `docs/WEB_PUSH.md` | browser limitations, verification steps | rewrite scope, privacy (payload, lock screen) and setup to match this plan |
| tests (`push-transport.test.ts`, `push-send.test.ts`, `PushSettings.test.tsx`, `lib/push.test.ts`, `shared/push.test.ts`) | most cases | move the core tests (below); add encryption, payload and visibility cases |

`apps/web/src/app/manifest.ts` and the icons belong to **#367** and ship in
that PR. One note for it: #360's `start_url` is `/timetables`, which is
right because it is the signed-in home.

### Change: the review findings from #368

1. **Never show an unconfigured control.** The alerts line, the Push
   column and the sidebar link render nothing when the GraphQL
   `pushPublicKey` field is null. #360 showed the card and then failed with
   a 503 on Enable. `pushPublicKey` already returns null when the keys are
   missing or during view-as. Keep that, and gate all three on it.
2. **Deactivation pauses and never deletes.** #360's `deliverOne` deletes
   the subscription when `member.deactivatedAt` is set. That is wrong because
   member-deactivation is reversible, and now also because the subscription
   belongs to the device, not the forum. The sweep **skips** deactivated
   memberships. Events during the deactivation are passed over at the time,
   so reactivation replays nothing, with no stamp needed.
3. **No HTTP send inside a database transaction.** #360's `deliverOne`
   holds `SELECT … FOR UPDATE` open across `send()`, which is up to 5 s per
   device with a pool of 10 connections (R17). The sweep (§3.2) claims its
   work in one short transaction, commits, and only then sends, with no
   connection held.
4. **Edge.** Accept Microsoft's push service. In `validPushEndpoint`, add
   `host.endsWith(".notify.windows.com")` alongside `.push.apple.com`.
   Suffix match on the full label, so `evilnotify.windows.com` fails. Test
   both cases. Edge is common on institutional Windows machines.
5. **Rate limit on subscribe.** Add `pushSubscribe: { windowMs: 60 *
   60_000, max: 30 }` to `ACTION_LIMITS` in `apps/api/src/http/action-limits.ts`,
   with a `BLOCKED_MESSAGES` entry, and check it in the subscribe route
   before `managePush`. The device cap limits how many rows a member holds;
   the rate limit limits how fast they churn them.
6. **Key check once at boot.** #360's `pushConfig()` re-derives and compares
   the key pair on every call. Move validation into `apps/api/src/env.ts`
   next to the `SPACES_*` block and expose a frozen `env.push` (or null).
   §3.1 has the rule.
7. **Package boundaries.** #360 widened `apps/api/tsconfig.json` `rootDir`
   to `../..` so an api test could import core's source by relative path.
   Revert that. `push-core.test.ts` imports from `@timetable/core` like the
   rest of api's tests. Pure logic (kind defaults, payload trimming) sits in
   `packages/shared` with its own vitest file.
8. **Lounge.** Covered by its own row in the kind list and by the
   send-time Lounge gate in §1.

### Replace: the sender

#360's `deliverPush` walks **20 devices per run**, oldest first, and
re-reads each one's notification list. With a scheduler calling it every few
minutes, an alert at 100 devices can take **25+ minutes** (#368). §3.2
replaces it with an event sweep that reads what happened once per minute
and fans out to the devices that want it.

---

## 3. Hosting

### 3.1 VAPID keys

**What they are.** A VAPID key pair identifies *our server* to the browser
push services. When someone turns alerts on, their browser receives our
public key and locks the subscription to it. From then on, Google, Apple,
Mozilla and Microsoft accept a push for that subscription only when it is
signed with our private key. The private key alone reaches nobody: sending
also needs each subscription's endpoint and payload keys, which live only in
our database. Together they would let someone show arbitrary text on
members' devices, so the database's push columns are as sensitive as the
key, and neither is ever logged. Losing or **rotating** the key silently
breaks every existing subscription, and everyone would have to turn alerts
on again. **Generate each key once per environment and never rotate it
casually.**

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

- **None set** → push is off. The alerts line, Push column and sidebar link
  are hidden, subscribe returns 503, and the sweep is idle. This is the
  default everywhere until Ed adds keys.
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

One extra env var, `PUSH_PAUSED=true`, works as a **kill switch**: the
controls stay, the sweep keeps advancing its cursor, and nothing is sent, so
unpausing doesn't release a backlog. Ed can set it in the DO console on the
api component. It takes effect on the component restart with no deploy, the
same lever as `RATE_LIMIT_MAX` in the incident runbook.

### 3.2 Delivery: a once-a-minute sweep inside the API

Context: one API instance (`instance_count: 1`, R10), a 0.5 GB box, a
10-connection database pool (R17), and a cohort of tens to low hundreds.
Ed chose a sweep over sending inline at the event: alerts take up to about
a minute, nothing new runs anywhere, and it costs nothing. The event code
paths (`addComment`, the Lounge writes, slot mutations, `setTopicReady`)
are **not touched**.

**The loop.** A `setInterval` started in the API's boot (only when
`env.push` is set) runs `sweepPush()` every 60 s, and the existing SIGTERM
drain stops the timer and waits for an in-flight sweep. Each run:

1. **Claim a time window.** In one short transaction:
   - `SELECT pg_try_advisory_xact_lock(<push sweep key>)`. If false,
     another instance is sweeping: commit and return.
   - read `swept_until` from the one-row `push_sweep_state` table;
   - set the new upper bound `to = now() - interval '10 seconds'`. The lag
     lets transactions that started before `to` but commit just after it
     become visible, since rows are stamped with their start time;
   - if `swept_until` is more than 10 minutes old (first boot, long
     outage), start from `to - 10 minutes`. Alerts are for now; the pane
     and digest carry the rest;
   - `UPDATE push_sweep_state SET swept_until = to WHERE swept_until =
     <value read>`. Compare-and-set: if it changes zero rows, someone else
     claimed the window, so return;
   - commit. The lock is released with the transaction.
2. **Read what happened in the window** `(from, to]`, once for all
   recipients: new topic comments, Lounge comments, mentions, `slot.*` and
   `topic.*` activity events, ❤️/💙 ledger rows, released slots and new
   memberships. A handful of indexed range queries.
3. **Work out recipients per event**, by the kind map in §1: host, parent
   author, chain members, mentioned users, ❤️-ers, and so on. Keep only
   people with at least one push subscription.
4. **Filter per recipient:** the kind's Push switch on that membership
   (`isPushKindEnabled` over `digestSettings.push`, falling back to
   `PUSH_KIND_DEFAULTS`); the audience rule; the send-time visibility checks
   in §1; not their own action; subscription `created_at` before the event;
   thread not already read past.
5. **Build and send.** Group by device, one alert per thread tag, at most
   three per device per run plus one "and n more" overflow. Encrypt each
   payload for the device and send it through a concurrency limiter of 4,
   each with #360's 5 s deadline, with no database connection held.
6. **Record results** in one statement per outcome: `last_sent_at` and
   `failure_count = 0` on success; delete on `gone` (404/410); bump
   `failure_count` on 429/5xx, deleting at 20 consecutive failures.

**Why nothing is sent twice.**
- *Overlapping runs on one instance:* an in-process `running` flag makes a
  tick that starts while the last one is still sending return at once.
- *Two API instances (R10):* the advisory lock means only one does the work
  each minute, and the compare-and-set on `swept_until` makes each window
  belong to exactly one run, lock or not. Both instances run the timer, so
  if one is down the other carries on.
- *A crash mid-send* loses at most that minute's unsent alerts, because the
  window was already claimed. This is at-most-once by choice: a duplicate
  buzz is worse than a missed one, and the pane and digest are the durable
  record of what happened. A deploy's SIGTERM drain waits for the sweep, so
  ordinary restarts lose nothing.
- Retries for 429/5xx are not re-queued: the next event in that thread
  alerts as usual.

**Cost per run.** At this cohort size: about ten range queries for the
window, then per-recipient checks only for the few people an event touches.
The worst case is a session confirmed on a topic with 80 ❤️s, so 80
recipients each needing a cheap check, spread behind the limiter. Our
comment action limit (12/min/user) already caps how much fan-out one account
can trigger. FCM, Mozilla, Apple and WNS allow far more than a forum
generates.

### 3.3 Nothing else changes on the infrastructure side

- **No new component, DNS, CDN or object storage changes.** `/sw.js` is a
  static file from the web component, and the sweep lives in the API.
- **CSP:** the service worker is same-origin. The browser contacts the push
  service itself, not the page, so `connect-src` needs nothing new. Verify
  on dev all the same.
- **No new outbound firewall rules.** The API already makes outbound HTTPS
  calls (to Resend and Clerk).

### 3.4 iOS, the installable app (#367) and the "Get Notifications" link

Apple allows web push **only for a web app installed on the Home Screen**
(iOS/iPadOS 16.4+), and only when opened from that icon. A browser tab
cannot subscribe at all. So:

- **#367 ships first** (PR #376; glossary: installable-app). Its manifest
  (`name: "Topic"`, `display: "standalone"`, 192/512 icons) is what makes
  "Add to Home Screen" produce a real app. Push without #367 works on Android, Windows and Mac, but never
  on iPhone.
- **Installed is a separate browser profile.** The Home Screen app has its
  own storage and its own Clerk sign-in. Members sign in once inside the
  installed app, and the install steps say so.
- **Desktop Safari** (macOS 13+) and **Android** need no installation.

**The "Get Notifications" sidebar link.** A client component in the forum
sidebar (`apps/web/src/app/(app)/f/[slug]/layout.tsx`), shown only where
alerts are possible and not yet set up on this device:

| This device | Link | Opens |
|---|---|---|
| iPhone/iPad, in a browser tab (not running as the installed app) | shown | the "Add to Home Screen" steps: Share → Add to Home Screen, open Topic from the icon, sign in, turn alerts on |
| a browser that supports push (including the installed iPhone app), no subscription for this device yet | shown | the Notifications page's alerts line (`/f/<slug>/notifications#alerts`, via `next/link`) |
| alerts already on for this device | hidden | — |
| push impossible: no `PushManager`/service worker, iOS before 16.4, permission denied, push not configured (`pushPublicKey` null), or an admin view-as preview | hidden | — |

The install steps are the same text the alerts line shows on an iPhone tab,
from one shared component, so there is one explanation in two places: the
sidebar and where alerts are offered.

**Detected after hydration.** The server and the first client render both
output nothing. A `useEffect` then reads `navigator.standalone` /
`matchMedia("(display-mode: standalone)")`, the iOS check from
`lib/push.ts` (iPads that report as Macs included), `"PushManager" in
window`, `Notification.permission`, and
`registration.pushManager.getSubscription()` matched against the server's
list for this user. Only then does the link appear, so there is no
hydration mismatch. Turning alerts on or off updates it through a small
module-level store, so it disappears without a reload.

---

## 4. Rollout

### Order of events

1. **Builder PRs land on `main`** (§6). Everything ships **inert**: with no
   keys, the alerts line, Push column and sidebar link are hidden and the
   sweep idles. So nothing changes for anyone when this reaches dev or
   production.
2. **Ed creates the dev key pair and adds the dev secrets** (see "What only
   Ed can do" below).
3. **Next dev deploy** (any merge, or a manual `Deploy Dev` run) picks the
   keys up. A builder then verifies on dev:
   - the sidebar link appears, opens the alerts line, and disappears once
     alerts are on;
   - opt in on Android Chrome, desktop Chrome/Firefox/Edge, and macOS Safari;
   - a second seeded user replies to a comment; the alert arrives within
     about a minute with who, where and the first line, and tapping it
     opens that comment;
   - a Lounge reply and a drafting-thread comment alert their audience and
     no one else; an elector with Push on for `comments` gets nothing from
     a drafting thread;
   - switch a kind's Push off in one forum; it stops there and not in a
     second forum;
   - lock the screen on Android and note what shows;
   - deactivate, comment, see no alert; reactivate, and nothing replays;
   - set `PUSH_PAUSED`, comment, see no alert; unset it, and no backlog
     arrives.
4. **iPhone check on dev** needs a real iPhone: the sidebar link shows the
   install steps in Safari, the installed app subscribes, an alert arrives,
   and the locked screen hides its text by default.
5. **Ed creates the production key pair, adds the production secrets, and
   runs `deploy-production.yml` himself** (agents never deploy production).
6. Optionally, Ed tells members in the next digest or in person.

### How Ed turns it on and off

- **Per environment, on:** add the three secrets, then deploy. Keys present
  means the feature exists.
- **Per environment, paused:** `PUSH_PAUSED=true` on the api component in
  the DO console. Subscriptions are kept and resume when unset.
- **Per environment, gone:** remove the secrets and redeploy. The controls
  disappear. Subscriptions stay in the database, harmless, and work again
  if the *same* keys come back.
- **Per person:** each member's own device switch, and the Push column per
  forum.
- **No per-forum admin switch in v1.** Nothing is pushed unless a person
  asks for it on their own device. A Forum Settings toggle is easy to add
  later if a forum wants alerts unavailable altogether.

### What only Ed can do

Agents never touch repo settings, GitHub secrets, or DO infrastructure, and
never deploy production.

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
5. **Test on an iPhone** once on dev (step 4 above).

### Migration

Two new tables, `push_subscriptions` (with its unique endpoint and a user
index) and the one-row `push_sweep_state`. The push kind switches need no
column: they are a new optional `push` field inside the membership's
existing `digestSettings` jsonb (`MembershipDigestSettings` in shared),
read through `PUSH_KIND_DEFAULTS` when absent. **Additive only** (R11):
nothing existing is altered, so a code rollback leaves harmless unused
tables. Take the next free number at build time (0045 today).

---

## 5. Decisions (Ed, 2026-10-03)

1. **Alerts show who, where and the first line** ("Joshua Becker in Faculty
   Lounge: but we have infinitely nesting…"), as an encrypted payload, and
   tapping opens the item itself. Reason: a bare "You have new activity" is
   too vague to act on. Encryption keeps it from Apple and Google, and Ed
   accepted the lock-screen trade-off (hidden by default on iPhone, often
   shown on Android and desktop), with visibility checked per recipient at
   send time. About +2–3 builder-hours.
2. **Settings are a Push column beside Email** in the existing "What to
   include" list, with targeted kinds on and broadcast kinds off by default,
   a line above the list to turn alerts on for this device, kind switches
   per forum and the subscription per device. Reason: one familiar list
   instead of a second settings surface, and each kind can be pushed or
   emailed independently. The Lounge row replaces the separate Lounge
   alerts question. About +4–6 builder-hours.
3. **Delivery is a once-a-minute sweep inside the API**, not inline sending.
   Reason: up to a minute is fast enough, nothing new runs anywhere, it
   costs nothing, and the event code paths stay untouched. Overlap and
   second-instance safety come from an in-process flag, a Postgres advisory
   lock, and a compare-and-set on the sweep cursor.
4. **iPhone users get a "Get Notifications" sidebar link plus the
   explanation where alerts are offered.** It shows only where alerts are
   possible and not set up on this device, and is detected after
   hydration. Reason: people find out without a banner nagging everyone,
   and the link vanishes once it has done its job. Depends on #367. About
   +2 builder-hours.

---

## 6. Effort and build order

Estimates are builder-hours including tests, review fixes and the
execution-journal entry. Each step is one PR, merged in order. Each ships
inert until keys exist.

| # | PR | Contents | Hours |
|---|---|---|---|
| 0 | **#367 installable app** (prerequisite, its own issue). **Built in PR #376 (2026-10-03)** | manifest, 192/512 icons, Apple touch icon and meta | 2–3 |
| 1 | **Push data + kind defaults**. **Built in PR #377 (2026-10-03)** | migration (next number): `push_subscriptions` per user with `p256dh`/`auth`, and `push_sweep_state`; core `managePush` with the endpoint lock and per-user device cap; shared `PUSH_KIND_DEFAULTS`, `isPushKindEnabled`, `PUSH_EVENTLESS_KINDS`, payload trimming, with tests; core tests via `@timetable/core`, `rootDir` untouched | 4–5 |
| 2 | **API config, transport, encryption, routes** | `env.ts` VAPID boot rule and `PUSH_PAUSED`; `push-transport.ts` with RFC 8291 payload encryption and the Edge host; subscribe/unsubscribe routes with the `pushSubscribe` action limit; GraphQL `pushPublicKey`, this user's device list, and `push` kinds on `updateMyForumDigestSettings`; spec, workflow and `.env.example` entries | 5–7 |
| 3 | **Sweep sender** | `sweepPush` with the claimed window (advisory lock, compare-and-set, 10 s lag, 10 min cap), event readers, the kind map, per-recipient visibility checks, payload building, per-device grouping and overflow, limiter, result recording; boot timer and SIGTERM drain; tests for double-claim, overlap, deactivated, hidden thread, Lounge gate, gone, `PUSH_PAUSED` | 7–9 |
| 4 | **Service worker + alerts line** | `sw.js` showing the payload, with the fallback and no-cache header; the alerts line above "What to include" (turn on/off for this device, denied and iPhone explanations); `/notifications` chooser as the fallback target; jsdom tests after `QueueControls.test.tsx` | 5–6 |
| 5 | **Push column** | `DigestSettingsForm` becomes a two-column Email/Push list, shown even when the email cadence is Never (the Email column greys out instead), dash for `drafts`; saved through the same mutation | 4–6 |
| 6 | **"Get Notifications" link** | sidebar client component with post-hydration detection, the shared install-steps component, store so it hides on subscribe; jsdom tests for each row of the §3.4 table | 2 |
| 7 | **Docs** | `docs/WEB_PUSH.md` (adapted from #360, with privacy and lock-screen notes); `DEPLOYMENT.md` env table + secrets; `OPERATIONS.md` note (kill switch, key-loss consequence, sweep); `ARCHITECTURE.md`; a CLAUDE.md glossary entry | 2 |
| 8 | **Dev verification** (no PR) | the §4 checklist on real devices; iPhone with Ed or a tester | 2–3 |

**Total: about 31–40 builder-hours for push, plus 2–3 for #367.** That is
the earlier 23–29 plus Ed's rulings: +2–3 for alert content, +4–6 for the
Push column and +2 for the sidebar link. Dropping the inline path roughly
pays for the sweep's event readers, so the sender stays at its earlier size.

Steps 1 and 2 can be built in parallel. Step 3 needs both. Step 4 needs
step 2. Step 5 needs steps 1 and 4. Step 6 needs step 4 and #367. Step 7
can trail by a day.
