# Sysadmin read access to private forums (read-only, visible, logged)

**Date:** 2026-07-29

Ed asked how operator access usually works; the industry answer is that
operators can always read everything in substance (they run the
database) — well-run products differ by making that access explicit,
read-only, and auditable rather than ad hoc. Implemented accordingly:

- `Viewer.sysadmin` flag (set only by the API layer from SYSADMIN_EMAILS,
  never under an impersonation preview). It unlocks READ checks only —
  `canReadTimetable`, `canSeeComments`, `canSeePersonProfile`; every
  write/action check ignores it, so oversight is read-only by
  construction (tested).
- `getReadableTimetable` accepts the flag; the request context passes it
  and LOGS a `sysadmin` line whenever operator access reads a
  private/deactivated forum the member roles wouldn't unlock.
- The web layout shows an unmistakable amber "Sysadmin view — read-only"
  banner in that state (only sysadmins can reach it, so no extra
  viewer-identity plumbing needed).
- Deliberate boundary: host-only and drafting threads stay role-gated —
  those checks are coupled to posting rights; widen later if oversight
  should include staff tiers.
