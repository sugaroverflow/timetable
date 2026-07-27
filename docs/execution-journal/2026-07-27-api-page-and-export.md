# 2026-07-27 - Data export endpoint and per-forum API page

## What happened

First slice of read-only agent/API access: a role-filtered, timestamped JSON
export and an "API" page. The page is deliberately the single home for all
user-facing communication about machine access — per product decision, it
carries no starter prompts and no email mentions, and stays in a factual
access-description tone (it describes what a viewer's role is allowed to
access, not what to do with it).

## Implementation

- Core `buildDataExport` (`packages/core/src/export.ts`) reuses the shared
  permission checks (`canSeeHostOnly` / `canModerate` / `canSeePersonProfile`)
  and the owner-role stripping already used elsewhere. The hearts matrix is the
  current post-cutoff hearts on published topics (`loadPublishedHearts`). It
  carries NO timeslot data — that feature is unreleased.
- REST `GET /api/timetables/:idOrSlug/export`
  (`apps/api/src/rest/router.ts`) returns the file with a Content-Disposition
  attachment header. Any reader may call it; anonymous requests are allowed on
  public forums.
- `ExportDownloadButton` (`apps/web/src/components/ExportDownloadButton.tsx`)
  fetches the blob via `clientApi` so the Clerk bearer header rides along — a
  plain `<a href>` can't carry it — and hands the browser a file.
- New page `apps/web/src/app/(app)/t/[slug]/api/page.tsx`: a server component,
  no role gate — any reader may view it; the endpoints themselves enforce
  access. The nav link is members-only while the page itself is reachable by
  any reader.
- `"api"` was already in `RESERVED_SEGMENTS`, so the route causes no
  user-slug collision.
