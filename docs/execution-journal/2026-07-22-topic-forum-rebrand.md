## 2026-07-22 - Rebrand Code Phase: "Topic" / forums / 📚

### Goal

Ed's round-2 item (issue #59): the brand becomes **Topic** (topic.forum),
timetables are called **forums** in the product, the logo becomes 📚, and
the homepage product copy goes away for now. This entry covers the code
phase only — the domain cutover (DO domains, Clerk domain, Resend domain,
DNS records for Ed) happens separately, timed with the clean-DB launch.

### Changes

- User-facing copy sweep across `apps/web` (22 files): "Timetable" brand →
  "Topic", the tenant entity → "forum" in JSX text, labels, aria, hints,
  toasts, metadata. **Code identifiers, `@timetable/*` packages, routes
  (`/t/`, `/timetables`), CSS classes and the GraphQL schema keep
  `timetable` naming** — rule recorded in CLAUDE.md so future agents don't
  blanket-rename (same lesson as the "draft" collision).
- Logo: `TopbarBrand` and the homepage now render 📚 (emoji span in the
  existing `.brand-logo` box); old PNG asset unreferenced (deletion +
  a proper favicon are follow-ups).
- Homepage: marketing copy removed per Ed — minimal brand + sign-in links.
- Emails: digest subject/heading "Your Topic digest"; EMAIL_FROM fallback
  display name "Topic".
- e2e assertions updated for the new copy.

### Deliberately not changed (flagged for the cutover pass)

- `apps/web/src/proxy.ts` canonical hosts (`timetable.love`) — live infra.
- API error strings ("Timetable not found" …) and ICS PRODID/UID — semi-
  visible identifiers; decide at cutover.
- No favicon file existed; add an emoji `app/icon.tsx` at cutover.

### Verification

Typecheck, lint, unit tests (58), Playwright e2e (3) — all green.
