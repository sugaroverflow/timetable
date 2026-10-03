# Web Push

How phone and desktop alerts work in Topic, **as built** (#368, PRs #376–#384,
2026-10-03). The design and Ed's rulings are in `docs/web-push-plan.md`; this
page describes the code on `main`. Where the two differ, this page is right
and says so.

Push is **inert until the API has VAPID keys**. With no keys, nothing in this
page renders or runs: no alerts line, no Push column, no sidebar link, no
service worker, no sweep.

## In one paragraph

A member turns alerts on **per device** from a forum's Notifications page.
Which things alert is chosen **per forum** in the Push column of the "What to
include" table, beside Email. Once a minute the API **sweeps** everything
that happened in the last window, works out who should hear about each event,
checks per recipient that they may still see it, and sends each device an
**encrypted** payload: who, where, and the first line ("Joshua Becker in
Faculty Lounge" / "but we have infinitely nesting…"). The service worker
shows it, and tapping it opens the comment or conversation itself. An alert
takes up to about 70 seconds. Email digests and the in-app notifications
pane are unchanged and independent.

---

## 1. Devices and per-forum kinds

Two separate settings, on purpose:

| | Where it lives | Scope |
|---|---|---|
| **The device subscription** ("Alerts on this device: Turn on") | `push_subscriptions`, one row per browser subscription, keyed to the **user** (FK to `user`, cascade on delete) | every forum on that device; other devices untouched |
| **The kind switches** (the Push column) | `timetable_memberships.digest_settings.push` (jsonb, optional) | one forum; they follow you to every device |

**Devices** (`packages/core/src/push.ts`, migration `0045_web_push.sql`):

- A row holds the `endpoint` (unique), the browser's payload keys `p256dh`
  and `auth`, an optional `label` ("Chrome on Android", built client-side,
  never the raw user agent), `created_at`, `last_sent_at` and
  `failure_count`.
- `subscribePush` takes a Postgres advisory lock on the endpoint, then on
  the user. An endpoint already held by **another** account is refused
  (`taken`), never moved; the browser then drops its subscription and
  subscribes again for a fresh endpoint (`turnOnPush` in
  `apps/web/src/lib/push.ts`). The same user re-sending refreshes the keys
  and resets `failure_count`.
- At most **10 devices per user** (`PUSH_DEVICE_CAP`). The 11th is refused
  with "Alerts are already on for 10 devices — turn them off on one first".
- `POST /api/push-subscriptions` (body: `PushSubscription.toJSON()` plus
  `label`) and `DELETE /api/push-subscriptions` (body: `{ endpoint }`), in
  `apps/api/src/rest/router.ts`. Both answer 503 while push is off, 403 in
  an admin's view-as preview or for a personal API token, 401 signed out.
  Subscribe also checks the push-service host allowlist
  (`validPushEndpoint`), the keys (`validPushKeys`, a trial encryption), and
  the `pushSubscribe` action limit (30 an hour,
  `apps/api/src/http/action-limits.ts`).
- GraphQL (`apps/api/src/graphql/push.ts`): `pushPublicKey` (null when push
  is off, signed out, under view-as, or for a personal token; still the key
  while paused), `myPushDeviceEnabled(endpoint)` ("is THIS device on?") and
  `myPushDevices(endpoint)` (no endpoint field). No UI lists devices yet.
- The browser re-sends its subscription only when its endpoint or keys have
  changed since this page last sent them: localStorage keeps a SHA-256
  fingerprint per user, never the values.

**Kinds** (`packages/shared/src/push.ts`):

- Every row of `DIGEST_KINDS` has a Push switch except `drafts`
  (`PUSH_EVENTLESS_KINDS`: a reminder computed when the digest runs, with no
  moment to alert on; its cell shows "—").
- `isPushKindEnabled(digestSettings.push, kind)`: the member's stored switch,
  else `PUSH_KIND_DEFAULTS`. There is no forum-defaults layer (email has
  one): a forum can't switch anyone's phone on.
- The audience rules are the digest's (`digestKindApplies`): a row hidden
  from you for email is hidden for push.
- Saved through `updateMyForumDigestSettings(pushKindsJson:)`, which
  **replaces** the stored set and is strict (unknown kind, `drafts`, or a
  non-boolean is a BAD_REQUEST). `Forum.viewerPushKinds` returns the
  resolved switches as JSON.

## 2. The sweep

`apps/api/src/push-sweep.ts` (orchestration) + `packages/core/src/pushEvents.ts`
(the database half) + `packages/core/src/pushAudience.ts` (the decisions,
pure). The event code paths (`addComment`, the Lounge writes, slot
mutations, `setTopicReady`) are not touched: the sweep only reads.

**The timer.** `apps/api/src/index.ts` starts it only when `env.push` is set,
every 60 s (`PUSH_SWEEP_INTERVAL_MS`, unref'd). The SIGTERM drain stops the
timer at once and waits for an in-flight sweep, still under the 10 s shutdown
backstop.

**One run** (`sweepPush`):

1. **Claim a window** (`claimPushSweepWindow`), in one short transaction:
   - `pg_try_advisory_xact_lock(368000, 0)` (`PUSH_LOCK_NAMESPACE.sweep`).
     Not got → `busy`, another instance is sweeping.
   - `to = now() − 10 s` (`PUSH_SWEEP_LAG_SECONDS`): rows are stamped with
     their transaction's start time, so the lag lets a transaction that
     began before `to` commit and become visible first.
   - `from = greatest(swept_until, to − 10 min)`
     (`PUSH_SWEEP_MAX_LOOKBACK_MINUTES`): after a long gap (first boot, an
     outage) alerts are for now; the pane and digest carry the rest.
   - Compare-and-set: `UPDATE push_sweep_state SET swept_until = to WHERE
     swept_until = <value read>`. Zero rows → `raced`.
   - Commit, which releases the lock.
2. **Paused?** If `PUSH_PAUSED`, stop here. The cursor has moved, so
   unpausing releases no backlog.
3. **Read what happened** in `(from, to]`, once for everybody
   (`loadPushAlerts`): `gt`/`lte` range reads, run one after another so the
   sweep holds at most one pool connection, and only for people who have a
   device.
4. **Decide per recipient** (`decidePushAlerts` → `decidePushCandidate`).
   One alert per person per event, even if they qualify several ways.
5. **Plan per device** (`planDeviceSends`): drop events from before the
   device subscribed; keep the newest alert per thread tag; order
   aimed-at-you (high urgency) first, then newest; send at most **3 per
   device** (`PUSH_ALERTS_PER_DEVICE`) plus one overflow, "And n more in
   {forum}" (opens `/f/<slug>/notifications`) or "And n more" across forums
   (opens `/notifications`).
6. **Send** through a limiter of **4** (`PUSH_SEND_CONCURRENCY`) with **no
   database connection held**. Each send is encrypted per device and has a
   5 s deadline (`sendPush` in `apps/api/src/push-transport.ts`).
7. **Record** (`recordPushResults`), the worst outcome per device winning:
   `ok` stamps `last_sent_at` and resets `failure_count`; `gone` (404/410)
   deletes the row; anything else (429, 5xx, timeout, network, and
   `rejected`, such as a 403 from a key mismatch) adds one failure, and the
   **20th consecutive** failure deletes the row (`PUSH_MAX_FAILURES`).

**At-most-once, by choice.** The window is committed before anything is
sent, so:

- overlapping ticks on one instance: the in-process `running` flag
  (`createPushSweeper`) makes the second return at once;
- two API instances: only one gets the lock each minute, and the
  compare-and-set means each window belongs to exactly one run, lock or not;
- a crash mid-send loses at most that minute's unsent alerts, never sends
  one twice. An ordinary deploy's SIGTERM drain waits for the sweep (but see
  the 10 s cap above);
- failed sends are not retried; the next event in that thread alerts as
  usual. The pane and the digest are the durable record.

**Timing.** An event at time *t* is read by the first sweep whose `to`
passes *t*: 10 s of lag plus up to 60 s until the next tick, so up to about
**70 s**, plus the push service's own delivery time. `Urgency` is `high` for
the on-by-default kinds and the sent-back notice, `normal` otherwise; `TTL`
is 3600 s (an alert can wait an hour for an offline device).

## 3. The kind map

As built in `pushEvents.ts` (event readers) and `pushAudience.ts` (wording).
Each reader mirrors a digest or pane reader, event-first instead of
person-first.

| Kind (default) | Event in the window | Who it alerts |
|---|---|---|
| `comments` (on) | a topic comment, any thread, not hidden or deleted | the topic's host |
| `replies` (on) | the same comment with a parent P | P's author and every other author of a child of P (`loadChainScope` read backwards) |
| `mentions` (on) | `comment_mentions` on those comments | the mentioned, unless already the host or in the chain |
| `commentsHearted` (off) | a public comment | the topic's ❤️-ers, unless host or in the chain |
| `commentsHostHearted` (off) | a public comment, or a {host}-only one where that thread is on | the topic's 💙-ers, unless host or in the chain |
| `lounge` (on) | a Lounge post, not hidden or deleted, conversation not hidden | a reply: the parent's author and every other author of a child of that parent; any post: its @mentioned people. **A new conversation alerts only its @mentions** |
| `sessions` (on) | `slot.confirm` / `slot.clear` activity | the topic's ❤️-ers |
| `sessionsHostHearted` (on) | the same | the topic's 💙-ers |
| `availabilityAsks` (on) | `slot.pencil` activity | the topic's ❤️-ers |
| `hearts` / `hostHearts` (off) | a `heart_events` add, through the active-member-filter; 💙 only where the {host}-only thread is on | the topic's host |
| `newTopics` / `newTopicsHost` (off) | `topic.publish`, topic still published | members with a device, not the host; the audience rule picks the row |
| `pendingReview` (off) | `topic.ready`, topic still a ready draft | admins and owners, not the host |
| `slotReleases` (off) | `timeslots.created_at`, starting in the future; one alert per forum | hosts and admins; not the creator when one person made them all |
| `newMembers` (off) | `member.first_login` activity (not membership creation: admins pre-create people with Add person) | admins and owners |
| `drafts` | none | — |
| sent-back (no switch) | `topic.unready` by someone other than the host, topic still a draft | the topic's host, always (like the digest's sent-back-notice) |

A person who qualifies for one event through several rows gets **one** alert,
sent if any of those switches is on and applies to their roles.

Not pushed, though the digest has them: new Lounge conversations (except to
their @mentions), `drafts`, and sessions on your **own** topic (the digest's
admin override; no push row covers them).

## 4. Visibility rules

Alerts carry content, so every one is re-checked **per recipient at send
time** (`decidePushCandidate`, in this order):

1. **Never your own action.**
2. **An active membership.** None → skipped. `deactivatedAt` set → skipped,
   never unsubscribed (the device is the person's, and member-deactivation
   is reversible). Events during the deactivation are passed over then, so
   reactivation replays nothing.
3. **A readable forum**: `canReadTimetable` (private forums need a role,
   `deactivated` forums an admin).
4. **The thread's visibility** (`canReadPushThread`): public — any member
   who can read the forum; {host}-only — `canSeeHostOnly`; drafting
   (`admin_only`) — the topic's host and admins (`canEditTopic`). Any
   thread on an **unpublished** topic: its host and admins only. ❤️,
   publish and session alerts need the topic readable the same way; ready
   and sent-back need `canEditTopic`; new members need an admin.
5. **The Lounge**: `canReadLounge` (shared `permissions.ts`; the room is on
   and you are a host or admin). It is the same function GraphQL's
   `seesLounge` calls.
6. **The calendar is on** (`isCalendarEnabled`) for session and slot-release
   alerts.
7. **The Push switch and its audience** (`isPushKindEnabled` +
   `digestKindApplies`); the sent-back notice has no switch.
8. **Not already read past**: `comment_seen` (topic comments) or
   `loungeSeenAt` (Lounge) at or after the event, e.g. because you were
   reading the thread live.
9. **The device subscribed before the event** (per device, in
   `planDeviceSends`).

Hidden and deleted comments are excluded in the readers themselves, and
❤️/💙 readers carry `givenByActiveMember`.

The one window left is between send and display: an alert delivered just
before someone is removed still shows on their device. The TTL (1 hour)
bounds how long a queued one can wait.

## 5. The alert text

The payload is `{ title, body, url, tag }` (`PushPayload` in shared),
serialised by `serializePushPayload`, which refuses an unsafe `url` and keeps
the JSON under 3 KB. Helpers: `pushTitle` (who + "in" + where, capped at
120 characters, " · {forum}" added for people active in more than one
forum), `pushBodyLine` (the first non-empty line, Markdown stripped for
Lounge opening posts, trimmed at a word boundary to about 100 characters
with "…", never splitting an emoji).

| Kind | Title / body | Opens |
|---|---|---|
| topic comments (`comments`, `replies`, `mentions`, `commentsHearted`, `commentsHostHearted`) | `Joshua Becker in Housing policy` / first line | the topic permalink, `?tab=comments` (or `host` / `admin`) `&topic=<id>#comment-<id>`; a draft with no permalink opens My Topics (or Pending for an admin) |
| `lounge` | `Joshua Becker in Faculty Lounge` (the forum's {host} label) / first line | `/f/<slug>/lounge?c=<root>&reply=<id>#comment-<id>` |
| `sessions`, `sessionsHostHearted` | `Session confirmed: Housing policy` (or `Session cleared:`) / `Wed 14 Oct, 18:00 · Room 2` | `/f/<slug>/calendar` |
| `availabilityAsks` | `Can you make it? Housing policy` / `Wed 14 Oct, 18:00` | the calendar |
| `hearts` / `hostHearts` | `A new ❤️ on Housing policy` (or 💙) / empty — who ❤️'d is not shown | the permalink |
| `newTopics` / `newTopicsHost` | `Ada Lovelace published a topic` / the title | the permalink |
| `pendingReview` | `Ada Lovelace marked a topic ready` / the title | `/f/<slug>/pending` |
| sent-back | `Ed moved your topic back to drafting` / the title | My Topics with the drafting tab named: `?tab=admin&topic=<id>#topic-<id>` |
| `slotReleases` | `New dates on the calendar` / `4 new dates from Wed 14 Oct, 18:00` | the calendar |
| `newMembers` | `Grace Hopper joined Newspeak 2026` / empty | `/f/<slug>/people` |
| overflow | `And 3 more in Newspeak 2026` (or `And 3 more`) / empty | that forum's Notifications page (or `/notifications`) |

Session times are in **Europe/London** (`PUSH_TIMEZONE`, the digest
schedule's clock; the email's session lines use UTC). Forums have no
timezone setting.

**Tags** (one per thread, so a burst replaces rather than stacks):
`topic:<id>:<comments|host|admin|sessions|heart|hostHeart|new|ready>`,
`lounge:<rootId>`, `calendar:<forumId>`, `members:<forumId>`,
`more[:<slug>]`.

## 6. The service worker

`apps/web/public/sw.js`, plain JavaScript with no build step.

- **Registered only on Turn on** (`registerServiceWorker` in
  `lib/push.ts`, scope `/`, `updateViaCache: "none"`), so nobody who hasn't
  asked for alerts has a worker.
- **No fetch handler and no cache**: nothing a member can read is stored in
  it, and there is no offline mode.
- **On push** it shows `title` with `{ body, icon: "/icon-192.png", tag,
  renotify: true, data: { url } }`. A missing, non-JSON or malformed
  payload, an empty title, or a `url` that is not a same-origin path gets
  the fixed **"Topic" / "You have new activity"**, opening `/notifications`.
- **On tap** it re-checks the path, focuses an open Topic window and
  navigates it, or opens a new one.
- `install` → `skipWaiting`, `activate` → `clients.claim()`: a new version
  takes over at once (it holds no state).
- Served with `Cache-Control: no-cache` (`apps/web/next.config.ts`). The
  proxy matcher already skips `.js`, and the CSP already allows
  `worker-src 'self' blob:` (pinned in `csp.test.ts`).
- Its `isSafePath` copies shared `isSafePushUrl`; `serviceWorker.test.ts`
  keeps them in step.
- No `badge` icon (Android draws its own) and no `pushsubscriptionchange`
  handler: a rotated subscription is re-sent the next time the member opens
  Topic (§1).

**`/notifications`** (`apps/web/src/app/(app)/notifications/page.tsx`) is the
fallback target: a forum chooser listing the viewer's forums, each linking to
its Notifications page, with no one-forum shortcut. Signed out, it goes to
`/sign-in?redirect_url=%2Fnotifications`.

## 7. iPhone and the installed app

- **Apple allows web push only for a web app on the Home Screen**, iOS/iPadOS
  16.4 or later, opened from that icon. A Safari tab can't subscribe. The
  installable-app (#367, `app/manifest.ts`) is what makes "Add to Home
  Screen" produce a real standalone app named "Topic".
- `detectPushSupport` (`lib/push.ts`) answers `unsupported` (no service
  worker, `PushManager` or `Notification`, not a secure context, or iOS
  before 16.4), `ios-tab` (an iPhone or iPad in a browser tab, including
  iPads that report as Macs, detected by touch points), `denied`, or
  `ready`. "Installed" is `navigator.standalone` or `display-mode:
  standalone`. An iOS user agent with no readable version is given the
  benefit of the doubt (treated as 16.4+).
- On an `ios-tab`, both the alerts line and the sidebar link show the same
  **install steps** (`components/InstallSteps.tsx`): Share → Add to Home
  Screen; open Topic from its new icon; sign in there; turn alerts on from
  the forum's Notifications page.
- **The Home Screen app has its own cookies**, separate from Safari's, so
  members sign in once inside it.
- Desktop Safari (macOS 13+), Android and desktop Chrome/Edge/Firefox need no
  installation. Edge's push service (`*.notify.windows.com`) is on the
  allowlist.
- iPhones hide notification text on a locked phone by default (Settings →
  Notifications → Show Previews: When Unlocked).

## 8. The alerts line and the Push column

On a forum's Notifications page (`app/(app)/f/[slug]/notifications/page.tsx`),
both render only when `pushPublicKey` is non-null **and** no view-as cookie
is set: one gate, so they appear and disappear together.

- **The alerts line** (`components/AlertsLine.tsx`, alerts-line) sits in
  `DigestSettingsForm`'s `alerts` slot, directly above "What to include",
  under the `#alerts` anchor. States: off ("Alerts on this device: **Turn
  on**"), on ("Alerts are on for this device · **Turn off**"), denied (how to
  allow notifications, no button), unsupported ("not available in this
  browser"), iPhone/iPad tab (the install steps). Off and on carry the
  lock-screen sentence: "Alerts show who wrote, where, and the first line,
  and some lock screens show them too." The browser asks permission only on
  the Turn on click. Turn off deletes the server row **and** unsubscribes
  the browser. Detection runs after hydration.
- **The Push column** (push-column, `DigestSettingsForm`'s `pushKinds`):
  "What to include" becomes an Email | Push table; it shows even when the
  email cadence is Never (the Email column greys out); the card is titled
  "Notification settings". Without keys the form is byte-for-byte the old
  "Email digests" card.

## 9. The "Get Notifications" link

`components/GetNotificationsLink.tsx` (get-notifications-link), in the forum
sidebar's foot between the theme toggle and "Report a bug". It reads the
same module-level store as the alerts line (`usePushDevice`), so it vanishes
without a reload once alerts are on.

| This device | Shows |
|---|---|
| iPhone/iPad in a browser tab (`ios-tab`) | a button opening a popover, "Get Notifications", with the install steps |
| push works, alerts not on here (`off`), the installed iPhone app included | a `next/link` to `/f/<slug>/notifications#alerts` (closes the mobile drawer too) |
| alerts on (`on`) | nothing |
| `unsupported`, `denied`, or not yet detected | nothing |
| no `pushPublicKey`, signed out, or a view-as preview | nothing, and no detection runs |

The forum layout (`app/(app)/f/[slug]/layout.tsx`) asks for `pushPublicKey`
and `me { id }` in its members-only badge query. Server render and first
client render are empty; detection runs in an effect.

## 10. Privacy

- **In transit, only the device can read an alert.** Payloads are encrypted
  to the browser's own keys (RFC 8291 `aes128gcm`, `encryptPushPayload`,
  `node:crypto` only, tested against the RFC's worked example). Google,
  Apple, Mozilla and Microsoft relay the bytes but see only size, timing and
  the endpoint.
- **On the device, the lock screen decides.** iPhones hide alert text when
  locked by default; many Android phones and all desktops show it,
  including on a screen being shared in a meeting. Ed accepted this
  (2026-10-03); the alerts line says so in one sentence.
- **Endpoints and keys are never logged and never sent back to the web
  app.** They are a capability: with our private key they would let someone
  put text on members' devices.
  - The endpoint travels in request **bodies**, never URLs (the request log
    records paths). The subscribe routes log nothing; a test spies on the
    console to prove it.
  - Core re-throws database errors as a fixed "Push subscription operation
    failed" (Drizzle messages embed parameters).
  - `sendPush` never throws or logs, and drops error text. The sweep logs
    counts only, and an error by its name only.
  - GraphQL has no endpoint field; the browser asks "is this endpoint mine?"
    and gets a boolean.
  - The browser's localStorage holds a SHA-256 fingerprint, never the
    endpoint or keys.
- **The private key is held as a `KeyObject`** (`push-config.ts`), whose
  inspect and JSON forms carry no key material, so logging `env` can't print
  it.
- **Signing out does not turn alerts off.** The device stays subscribed to
  the person who turned it on. On a shared device, Turn off first. If
  someone else signs in and turns alerts on in the same browser, they get a
  fresh endpoint and the old row dies as `gone`.
- Removal from a forum stops that forum's alerts (the sweep skips
  non-members); the device keeps alerting for the person's other forums.
  Deleting the user deletes their devices.
- The JSON export carries no push data.

## 11. Keys, the kill switch, and losing a key

**Three values per environment**, on the **api** component only (the web app
reads the public key through GraphQL):

| Variable | Secret? | Rule |
|---|---|---|
| `VAPID_PUBLIC_KEY` | no (kept as a secret for simplicity) | base64url of a 65-byte uncompressed P-256 point |
| `VAPID_PRIVATE_KEY` | **yes** | base64url of the 32-byte scalar (shorter keys are left-padded); must derive the public key |
| `VAPID_SUBJECT` | no (kept as a secret) | `mailto:<address>` or an `https://` URL the push services may use to reach us |

Generate a pair with `node scripts/generate-vapid.mjs` (keys to stdout, the
"PRIVATE is a secret" warning to stderr). Dev and production get
**different** pairs, as GitHub environment secrets in `timetable-dev` and
`production`; the deploy workflows pass them into the `.do/` specs.

**The boot rule** (`loadPushConfig` in `apps/api/src/push-config.ts`, called
once from `env.ts`):

- none set, or all empty/whitespace → push off, silently (a missing secret
  expands to `""` in the spec, and that must not take the API down);
- all three set and valid → `env.push`, push on;
- partial or invalid → in **production the API refuses to boot** with a
  message naming the variables, never values (DigitalOcean keeps the
  previous deployment and `DEPLOYMENT_FAILED` emails Ed); elsewhere it warns
  "… — Web Push is off".

**`PUSH_PAUSED`, the kill switch.** `true` or `1` pauses; unset, `""`,
`false` or `0` runs; anything else pauses with a warning. While paused the
controls stay, `pushPublicKey` still answers, the sweep keeps claiming
windows and sends nothing, so unpausing releases no backlog. It is read
**once at boot**: it takes effect when the api process restarts. It is a
GitHub environment **variable** (`vars.PUSH_PAUSED`) templated into the
spec, so a pause survives the next deploy. How to flip it:
`docs/OPERATIONS.md` R19.

**Removing the keys** (unset the three secrets, redeploy): the controls
vanish, subscribe and unsubscribe answer 503, the sweep doesn't start.
Subscriptions stay in the database, harmless, and work again if the **same**
keys come back.

**Losing or rotating the private key** breaks every existing subscription,
silently. Each browser subscription is bound to the public key it was made
with, so after a new pair:

- every send to an old device is refused by its push service (`rejected`,
  typically 403), counted as a failure, and the row is deleted at its 20th
  failed send (only devices that had alerts to send accrue failures; quiet
  ones linger harmlessly until then);
- until its row goes, the alerts line still reads "Alerts are on" on that
  device, because the server still holds the endpoint;
- **every member must Turn off, then Turn on, on every device.** Turn on
  alone is not enough: `turnOnPush` reuses the browser's existing
  subscription, which is still bound to the old key (recorded in
  `docs/execution-journal/2026-10-03-push-docs.md`).

So: **generate each pair once, keep a private copy of the production
private key in a password manager, and never rotate casually.** A leaked
private key alone reaches nobody (sending also needs the endpoints and keys
in our database); rotate only if both may have leaked.

## 12. Testing it

**Unit and component tests** (in CI): `packages/shared/src/push.test.ts`,
`apps/api/src/push-{config,transport,core,sweep}.test.ts`, the subscribe
routes in `app.integration.test.ts`, and in `apps/web`
`lib/push.test.ts`, `lib/serviceWorker.test.ts`,
`components/AlertsLine.test.tsx`, `components/GetNotificationsLink.test.tsx`
and `components/DigestSettingsForm.test.tsx`.

**The sweep's SQL against Postgres** (also in CI, the "Database tests (push
sweep)" step after migrations): from `apps/api`,
`PUSH_SWEEP_DB_TEST=1 DATABASE_URL=… npx vitest run src/push-sweep.db.test.ts`.

**Locally, end to end.** `localhost` is a secure context, so desktop Chrome
can subscribe through the real push service:

1. `node scripts/generate-vapid.mjs`, and put the two keys plus
   `VAPID_SUBJECT=mailto:you@example.com` in the root `.env`.
2. `npm run dev`, sign in as a seeded user (OTP **424242**), open a forum's
   Notifications page and Turn on.
3. In a second browser profile, sign in as another seeded user and reply to
   one of the first user's comments. The alert arrives within about 70 s.

The service worker alone can be driven headlessly with CDP
`ServiceWorker.deliverPushMessage` in **full** Chromium (the headless shell
accepts the message but never displays it).

**On dev** (plan §4, step 8). Dev has no keys until Ed adds the dev pair to
`timetable-dev`; the next deploy (any merge, or a manual Deploy Dev run)
picks them up. Then, with seeded users in separate browser profiles:

- the sidebar link appears, opens the alerts line, and disappears once
  alerts are on;
- opt in on Android Chrome, desktop Chrome/Firefox/Edge and macOS Safari;
- a reply alerts within about a minute with who, where and the first line,
  and the tap opens that comment;
- a Lounge reply and a drafting-thread comment alert their audience and no
  one else; an elector with Push on for `comments` gets nothing from a
  drafting thread;
- a kind switched off in one forum stops there and not in a second forum;
- lock an Android screen and note what shows;
- deactivate, comment, no alert; reactivate, nothing replays;
- set `PUSH_PAUSED`, comment, no alert; unset it, no backlog;
- on a real iPhone: Safari shows the install steps, the installed app
  subscribes, an alert arrives, and the locked screen hides its text.

How to tell the sweep is running is in `docs/OPERATIONS.md` R19.
