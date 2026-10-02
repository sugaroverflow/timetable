# Web Push

Topic supports optional, per-forum, per-browser/device Web Push. It is separate
from the existing in-app pane and email digests; enabling one never enables the
others. The forum Notifications page has an explicit Enable button. Permission
is requested only in that click handler, never on page load. Admin previews hide
the controls. Turning it off removes that forum's server subscription while
preserving subscriptions to other forums on the device.

The sidebar footer also links to the public fork's source repository, alongside
the existing bug-report link.

## Setup (operator action required)

No deployment specifications, production infrastructure, or scheduled workflows
were changed. Push is unavailable until an operator performs these steps:

1. Install normal repository dependencies and apply the additive migration with
   `npm run db:migrate` to the intended environment. Migration 0045 adds only
   `push_subscriptions`, its membership foreign key and unique index.
2. Generate a P-256 key pair privately with `node scripts/generate-vapid.mjs`.
   Its output contains a PRIVATE KEY: store it in your secret manager, never in
   Git, logs, a ticket, or a chat. Configure `VAPID_PUBLIC_KEY`,
   `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT` (a real `mailto:` contact or HTTPS
   contact URL) on the API. Only the public key is exposed through GraphQL.
   These are unpadded base64url encoded raw EC keys; public key is uncompressed.
3. Serve the site over HTTPS (localhost is sufficient for desktop development).
   `/sw.js` must be served as JavaScript from the web origin with the supplied
   no-cache headers. The manifest and 192/512 PNG icons must be accessible.
4. Arrange a scheduler to POST `/api/jobs/push`, authenticated with the existing
   `x-cron-secret: <CRON_SECRET>` header. Start with once per minute and **do not
   overlap runs**. This change does not install that scheduler or modify the
   digest schedule. Without it, opting in persists subscriptions but no alerts
   are delivered. Job responses contain only sent/gone/retry/skipped counts.
5. Open a forum's Notifications page on each intended device, and opt in. Verify
   on real Android and installed iOS devices with a second member posting a
   qualifying comment. Lock the device, run the job, check the generic alert,
   and tap it. Verify opt-out and membership removal stop further alerts.

The sender uses Node's standard ES256 signing for [VAPID (RFC 8292)](https://www.rfc-editor.org/rfc/rfc8292).
It sends an empty POST (a data-less push), so it needs no payload encryption
library and never sends private content. There is no simulated/local notification
fallback. Provider acceptance is not a guarantee of device receipt.

## Scope and privacy

The job uses existing notification selection: comments on your topics, direct
replies, mentions, and session events on topics you have voted for. This initial
slice sends only **public-thread activity on currently published topics**;
host-only and drafting threads are excluded. Calendar events are suppressed
when that forum's calendar is disabled. A public thread can belong to a private
forum: membership and forum readability are checked at delivery time, with no
operator/sysadmin bypass. Deactivated memberships are removed from push;
removed memberships cascade-delete their subscriptions. Re-enabling after
removal requires fresh opt-in.

Each opt-in starts at the current timestamp. Previously seen notifications are
also excluded. The worker always displays fixed text under the title “Topic”,
including for a malformed or unexpected payload. Neither forum names, member
names, message bodies, topic titles nor tenant identifiers reach the lock screen.
Click opens `/notifications`, a freshly authenticated chooser linking to each
current forum's Notifications page. It intentionally does not deep-link to an
individual private topic. The worker never caches pages/API responses and does
not provide offline browsing.

Subscription endpoints are capabilities. They are accepted only for fixed Google,
Mozilla, and Apple push-service hosts, over HTTPS without credentials/custom
ports/fragments; sends never follow redirects. Other gateways are unsupported
until reviewed. Endpoints are never query-string parameters and database failures
are sanitized before logging. Database access/backups still need normal access
controls. Payload encryption keys are not persisted because empty pushes do not
use them. A browser endpoint cannot be silently reassigned to another account;
turn off its forums using the original account first, or use another browser
profile. A maximum of ten devices per forum membership is enforced.

Signing out does not revoke device permission or server opt-ins. A previously
queued generic alert may still arrive; opening it requires sign-in and checks the
current account's access. On shared devices, turn off every forum before signing
out (or revoke the site's notification permission in browser/device settings).

## Browser limitations

Feature detection controls availability. On iPhone and iPad, this implementation
requires **iOS/iPadOS 16.4 or later and a web app installed on the Home Screen**;
open that installed app before enabling push. An ordinary Safari tab is not
enough. See [WebKit's platform guidance](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/).
Desktop Safari support started in Safari 16 on macOS 13; desktop/Android support
still depends on browser, permissions, OS settings and push-service availability.
Denied permission is explained without repeated prompts; reset it in browser or
OS notification settings. Focus modes, battery policies, cleared site data,
private browsing and offline periods can prevent or delay delivery. The sender
uses a five-minute TTL and the worker coalesces displayed alerts under one tag.

Expired subscriptions (404/410) are deleted when delivery is attempted. Other
provider/network failures retain the event watermark for a later job. If the
browser invalidates its subscription or VAPID keys are rotated, revisit settings
and opt in again; revoking/resetting the browser subscription may be required.
There is no unattended `pushsubscriptionchange` resubscription with stale auth.

## Operational limits and verification

This is a small best-effort vertical slice, not a durable notification queue.
Each run examines at most 20 devices, oldest attempted first, with a five-second
network deadline per send; allow more than 100 seconds for the job request.
Events are coalesced from the latest 50 in-app entries per member; bursts can
be collapsed or missed. A database transaction locks each subscription during
processing (`SKIP LOCKED` avoids concurrent processing of that row). A crash after
provider acceptance but before commit can duplicate an alert. Activity committed
late with an older timestamp can be missed. A future outbox/queue is needed for
guaranteed processing, larger deployments, backoff and richer diagnostics.
In-flight notifications cannot be recalled after opt-out or membership changes.

Tests cover permission UX, iOS detection, rollback on persistence failure,
per-forum opt-out, endpoint validation, VAPID signature/audience/expiry, fixed
worker content/navigation, event filtering, session boundaries, and core
membership/ownership/delivery behavior. Real push delivery and database migrations
must be verified in a configured development environment; no real provider was
contacted during implementation. See the execution journal for exact local
commands, results and environment blockers.
