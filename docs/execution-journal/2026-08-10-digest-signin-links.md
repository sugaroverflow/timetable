# 2026-08-10 — Digest emails: every link signs you in

Issue #230's biggest friction-killer: opening the app from a digest on a
phone meant landing signed-out and typing an OTP. The invite email
already solved this with Clerk sign-in tickets
(`createSignInTicket`, 2026-07-28 one-click invites) — this extends the
mechanism to digests, and to **every link**, not just one CTA.

Ed's design question ("can people click any link in a digest and be
signed in?") — yes, via a subtlety: tickets are single-use, but one per
email is enough. `wrapLinksWithSignInTicket(html, ticket)` (email.ts,
tested) post-processes the rendered digest and rewrites every
`linkBase` href to `/sign-in?__clerk_ticket=…&redirect_url=<original
path>`:

- First click consumes the ticket → signed in → lands on the link's
  destination.
- Every later click: a session now exists, so /sign-in passes straight
  through to `redirect_url` (the burnt ticket is irrelevant).
- Burnt ticket on a signed-*out* device (forward, other browser): the
  sign-in page falls back to the email-OTP form with the destination
  preserved — the pre-existing flow, one step worse than the happy
  path, never broken.

Wiring: the digest cron loop mints one ticket per (user, forum) email
via the existing `createSignInTicket` (30-day TTL; `null` on Clerk
hiccup degrades to plain links, never blocks the send). The admin
"Send test digest" gets the same treatment so the flow is QA-able
end-to-end. External links and the (nonexistent in digests) `/sign-in`
links are left alone; HTML entity escaping round-trips (`&amp;`
unescape → wrap → re-escape).

Accepted trade-off (same as invites since 2026-07-28): a forwarded
digest's first click signs the forwardee in as the recipient. Single-use
caps the exposure at one session per email.
