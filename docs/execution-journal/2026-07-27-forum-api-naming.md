# Public API surface renamed timetable → forum

**Date:** 2026-07-27

Ed's call: the public API must say **forum** before personal API tokens and
the MCP server ship and freeze the naming forever. Internal code, packages,
and DB tables keep `timetable` (churn > value there); only the surface
third parties will see changes.

## What changed

- **GraphQL exposed names:** types `Timetable` → `Forum`, `TimetableRoute` →
  `ForumRoute`; roots `timetable` → `forum`, `myTimetables` → `myForums`,
  `timetableHosts/Members/People` → `forumHosts/Members/People`,
  `timetableByDomain` → `forumByDomain`, `timetableRouteByDomain` →
  `forumRouteByDomain`, `myLastVisitedTimetableSlug` →
  `myLastVisitedForumSlug`, `updateTimetableProfile/Settings` →
  `updateForumProfile/Settings`; `Membership.timetable` → `Membership.forum`;
  exposed `timetableId` fields/args → `forumId`. Error strings say Forum.
- **REST:** `/api/timetables/*` → `/api/forums/*`. The two GET feeds whose
  URLs were already distributed — `calendar.ics` (tokens in members'
  calendar apps) and `feed.atom` (feed readers) — keep permanent 301
  redirects from the old paths, query string preserved. Never remove.
  The POST/DELETE endpoints had no external consumers and renamed cleanly.
- **Web:** queries alias the new names back to the internal ones
  (`timetable: forum(idOrSlug: $s)`), so response keys and every TypeScript
  identifier stay `timetable` — zero churn behind the transport boundary,
  and the pattern for new queries is documented in CLAUDE.md.
- Docs: CLAUDE.md rebrand canon updated (public surface = forum, aliasing
  convention, redirect rule); ARCHITECTURE GraphQL/REST sections renamed.

## Why now

The GraphQL schema was reachable but undocumented-to-outsiders until this
week; the Atom feed shipped yesterday and tokens/MCP are next on the
roadmap. This was the last cheap moment — after tokens ship, renames need
deprecation cycles.
