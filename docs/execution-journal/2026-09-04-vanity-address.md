# 2026-09-04 — vanity-address: topic.newspeak.house/2026

Ed: "can we do custom domains quickly? I'd like to have
https://topic.forum/f/newspeak-house-2026-27 at topic.newspeak.house/2026".

## What was there

Half a feature. `timetables.customDomain` (unique), a settings field
labelled "Custom domain (coming soon)" whose placeholder was
`forum.2026.newspeak.house`, `forumRouteByDomain(host)`, and a proxy
rewrite that served an entire HOST as one forum. Nobody had done the
operational half (the DO app's domain list, DNS) or faced the sign-in
problem underneath: Clerk sessions are per host, every link the app
builds is an absolute `/f/<slug>/…` path, and digest emails link to
topic.forum regardless — so "serve the forum on its own domain" was
always going to be partial, and the field said so.

Ed's ask has a different shape: one host for the school, a PATH per
year. Better for a poster (the hostname never changes), and not what a
hostname-only column and lookup could express.

## Decision: redirect, not serve-in-place (Ed, 2026-09-04)

A vanity address is a pointer. `topic.newspeak.house/2026[/rest]` 307s to
`https://topic.forum/f/newspeak-house-2026-27[/rest]`, query preserved.
Everything else — sessions, links, emails, CSP — stays as it is. Nothing
here precludes in-place serving later; the stored shape (host + path
prefix) is what that would need too.

## Pieces

- **`packages/shared/src/vanityAddress.ts`** — the grammar and the
  matcher, shared because the API validates what an admin types and the
  proxy matches requests: `parseVanityAddress` (host or host/prefix;
  tolerates a scheme, case, trailing slash; rejects ports, empty segments,
  characters people can't put on a poster), `formatVanityAddress` (the
  stored string), `matchVanityRoute` (longest prefix on a segment boundary;
  a bare-host route catches the rest). Unit-tested.
- **API** — `forumRoutesByHost(host): [ForumRoute]` with `slug` and
  `pathPrefix` replaces `forumRouteByDomain`; the unused dashboard
  `forumByDomain` is gone with it. `updateForumProfile` stores the
  canonical form and turns a duplicate address into a sentence rather
  than a unique-constraint error. The old `assertOptionalHostname` guard
  is gone — the shared parser is the validation now.
- **Core** — `listTimetableRoutesByHost`: `custom_domain = host OR LIKE
  host/%`, one query per host.
- **Web proxy** — `vanityRedirect` runs FIRST in `proxy()`, before Clerk
  sees a host it was never configured for: any host that isn't ours is
  redirected home — into the matched forum, or to the origin's root when
  nothing on that host matches (a stray host CNAMEd at us no longer
  renders the app under its own name, which the old rewrite path did).
  Routes are cached per host for 60 s, empty lists included. 307 rather
  than 308: admins edit these, and browsers cache 308 permanently.
- **Settings** — the field is "Vanity address", placeholder
  `topic.newspeak.house/2026`, copy says what it does and that the
  hostname must be pointed at Topic first.
- **Ops** — `topic.newspeak.house` added to the prod app spec as an
  ALIAS domain; `docs/DEPLOYMENT.md` gains the per-host procedure. Takes
  effect on the next production deploy (Ed's), or sooner via the DO
  dashboard; DNS is a CNAME at Newspeak's side.
- **e2e** — the smoke suite asserts an unknown host 307s home.

## Not done

Serving in place (Clerk satellite domain, host-aware links). The
column stays `customDomain` — renaming it is a non-additive migration in
term time (R11) and the GraphQL arg name is public.
