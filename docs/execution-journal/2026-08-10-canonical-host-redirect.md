# 2026-08-10 — One canonical host: aliases 308 to the deployment origin

Part of issue #230 (mobile "logs me out every day"): Clerk sessions exist
per host, and the app served topic.forum, www.topic.forum,
timetable.love, and www.timetable.love as equals — an old bookmark or
email link on the "wrong" host always landed signed-out and looked like
a dropped session.

Now the proxy 308-redirects every alias we serve to the deployment's
own origin (`NEXT_PUBLIC_API_URL`, which web+API share) before Clerk or
the custom-domain rewrite run:

- Pure decision fn `redirectTargetHost(host, webOrigin)` in
  `apps/web/src/lib/canonicalHost.ts` (unit-tested), which also now owns
  `canonicalHosts()` — the aliases stay in that set because it doubles
  as the "not a customer custom domain" check.
- Customer custom domains and local hosts are never redirected; a
  localhost origin (local dev) disables redirecting entirely.
- 308 (not 301) preserves method and query; ICS/Atom clients follow it.
- `www.timetable.love` added to the known-host set (the DO app spec
  serves it but the proxy never listed it — it previously fell through
  to the custom-domain lookup on every request).

Dev is unaffected in practice (nothing else points at
dev.timetable.love); prod gets the consolidation. Legacy `/t/` and
`/api/timetables/*` path redirects are untouched and now compose with
the host redirect (alias + old path = two hops, ends correct).
