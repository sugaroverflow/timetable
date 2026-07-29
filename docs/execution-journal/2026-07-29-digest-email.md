# Digest email: branded design, test path, Email Digest settings card

**Date:** 2026-07-29

Ed's three-parter: what's in the email, the sending machinery, and how
to test it — plus a new Forum Settings section.

- **Design**: new `emailShell` — one branded frame (Topic wordmark,
  white card on the app's wash, footer) now wrapping ALL outbound mail
  (digest, invite, new-forum notification). Email clients ignore
  stylesheets, so styles are inline and the colours are hardcoded hexes
  mirroring tokens.css's light palette. `renderDigest` rebuilt: greeting
  + "Since your last digest: 2 new topics, 1 reply…" intro (the same
  summary becomes the subject tail), serif section headings, quiet
  metadata, quoted reply snippets, and an unsubscribe-pointer footer.
  Unit tests cover the subject summary, sections, and escaping.
- **Machinery**: reviewed, no changes needed — `run-digests.yml` hits
  `/api/jobs/digests` daily (08:17 UTC, prod; manual dispatch can target
  dev), the endpoint is CRON_SECRET-gated, incremental via
  `users.lastDigestAt`, and skips empty digests.
- **Test path**: `POST /api/forums/:idOrSlug/digest-test` (admin-only,
  rate-limited) emails the requesting admin the REAL renderer over
  plausible example items ("[Test] Your Topic digest — …" subject), so
  what you see is exactly what members get.
- **Settings**: new "Email digest" card in Forum Settings — the digest
  defaults moved out of the profile form (which kept identity + role
  labels), with their own Save and the "Send test digest" button.
