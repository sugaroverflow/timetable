# 2026-08-03 — Seed data: calendar v2 coverage, live digests, 90% ❤️ coverage

The dev fixtures predated calendar v2 and digest v3: five October slots, no
session ownership, no claims, June-dated activity that left digests
permanently empty, and 36 of 87 topics hearted. This change makes the seeded
forum exercise the current product on any day it's seeded.

## Relative time anchors (seed-dev.ts)

Fixed fixture dates rot. The seed now anchors to the seed run:

- Slot dates accept `mon+1`-style relative forms (weekday + week offset, UTC
  weeks starting Monday); absolute `YYYY-MM-DD` still works.
- Comments spread across the last ~42h, ❤️s across the last ~4h, activity
  events across the last ~20h (`spreadTime` windows — monotonic, never
  future, however large the fixture grows). Slot `updatedAt` is recent so
  sessions count as digest news; `Published date, if published: recent`
  publishes a topic a few hours ago.
- Memberships get `inviteSentAt` — without it the digest gate (PR #203)
  drops every seeded member as "never contacted".

Result: `POST /api/jobs/digests` right after `npm run db:seed` emails (or
console-logs, without `RESEND_API_KEY`) full digests: topic cards with
comments/replies/❤️s, two "New" topics, an "Assigned to you" card
(`Recently assigned: yes` seeds a `topic.reassign` event), "📅 Coming up",
and "Can you make it?" asks.

## Calendar fixtures (dev-sample-data.md)

A 4-week rolling schedule (22 slots) over the same weekly pattern as before:

- Week 0: three confirmed sessions with Luma URLs (partly past as the week
  progresses), one proposed, one empty.
- Weeks +1/+2 (digest horizon): confirmed sessions, proposed sessions with
  **session claims** in the slot discussion (`Claim:` + `Counts:` — frozen
  🟢🟡🔴 snapshots), an **office-hours session** (`Session host:` with no
  topic), and two **off-grid** slots (`Off-grid: yes` — a host's Saturday
  park proposal and an evening clinic; no cellKey, excluded from the derived
  pattern/term/locations).
- Week +3: mostly open slots.
- Patterns: grace all-green, oscar all-red (with one explicit green override
  demonstrating explicit-beats-pattern), yuki mixed, ben partial (unpainted
  cells fall back to 🟡). Session ownership (`sessionHostId`) is now seeded
  for the never-displace rule.

## Topics & hearts

- All placeholder bodies replaced with realistic ones; 16 formerly-submitted
  placeholder topics are now published (staggered late-July dates). The
  moderation queue keeps 4 submitted examples; 2 unpublished + 1 archived
  unchanged.
- Hearts: 79 of 87 topics (~91%) carry at least one ❤️ (43 new rows).
  `topic-programming-sarah` and `topic-online-help-seeking` stay heartless
  as the empty-state case.

Checks: typecheck / lint / format / vitest green locally; parse + invariants
verified with a dry-run script (coverage %, horizon sessions, claim counts,
weekday alignment of relative dates). No local Postgres available — the
migrate + live-seed pass rides on CI.
