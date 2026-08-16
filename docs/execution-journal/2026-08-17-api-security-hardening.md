# 2026-08-17 — pre-prod security audit: API hardening

A six-dimension audit pass before the production push. This entry covers
the API findings (a web-hardening pass ships separately). Two were HIGH:

## View-as preview scoped to its forum

`resolveImpersonation` checked the admin's role in the forum named by
`x-view-as` — and then the swapped-in identity worked *everywhere*: an
admin of forum A sharing one member with private forum B could read B as
that member, list their forums, and mint their ICS token. Now:

- `getViewer(timetableId)` returns the anonymous viewer for any forum
  other than `impersonation.timetableId`;
- `readableTimetable` re-resolves other forums as the anonymous public;
- `myForums` filters to the preview forum, `myApiTokens` returns `[]`,
  and `myIcsToken` returns null under a preview (it would otherwise mint
  a long-lived credential that outlives the preview).

Covered by `context.test.ts` ("keeps a view-as preview inside the forum
it was granted in").

## Sysadmin addresses are unreachable by admin writes

Operator status derives from `users.email` (SYSADMIN_EMAILS), and
`PATCH /api/memberships/:id/email` / `POST /api/forums/:id/people` let
any forum admin set that column — with `replaceClerkEmail` marking the
address verified+primary in Clerk and an unclicked invite ticket as the
sign-in. Self-service escalation chain. `refuseSysadminAddress` (router)
now 403s both routes for any address on the sysadmin list. (SYSADMIN_EMAILS
is not yet set on prod — issue #118 — so this was latent, not live.)

## Privacy-matrix leaks closed

- **Export**: `buildDataExport` never consulted `canSeeComments`, so
  anonymous exports of `hosts_only`/`no_comments` forums shipped every
  public comment and the per-topic hearter-id lists. Both now follow the
  same gates as the resolvers: comments need `canSeeComments`, elector
  ids need member-or-public.
- **Weighted breakdown** (`topicWeightedBreakdown` + the field): was
  any-signed-in; on hosts_only forums that handed the public the elector
  membership the privacy level exists to hide. Both now gate on
  `canSeeComments` (member or public forum). Integration-tested.

## Smaller items

- `timetable-icon` uploads now require `canEditSettings` like the cover
  (was: any session).
- New action-limit buckets: `forum` (5/day — each creation emails the
  sysadmins and mints an admin surface) and `upload` (60/hour — objects
  are public-read and never GC'd).
- Cron secret comparison is constant-time (`secretsEqual`, SHA-256 +
  `timingSafeEqual`) and reads `env.cronSecret` (a getter, so tests can
  still set it per test).
- ICS `escapeText` normalises bare CR/CRLF before escaping — a lone CR
  in a topic title was property injection for lenient calendar clients.
  Unit-tested in `ics.test.ts`.
- Free-string GraphQL args got caps (`capLength`, `assertOptionalHttpUrl`,
  `assertOptionalHostname` in guards.ts): topic title/body, profile
  name/bio/image, forum name, custom domain (hostname-shaped), and the
  branding URLs (which land in `<img src>` and CSS `url()` on every page).
  REST already had zod; this closes the GraphQL half.

Verified clean by the same audit (recording the negative results): SQL
injection (all `sql``` templates parameterised), token auth path (hashing,
revocation, expiry, budget-after-auth), REST-refuses-tokens on all routes,
token scope map default-deny and complete, tenant scoping on every
client-supplied id, sysadmin read-only invariant, owner-role stripping,
Atom/email escaping, rate-limit keying.
