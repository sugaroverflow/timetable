# 2026-07-25 - Per-Forum Favicon and Page Title

## What happened

Browser tabs showed the generic 📚 favicon and "Topic" title everywhere,
even inside a forum. Requested behaviour: inside a forum the favicon is
that forum's icon and the title is "[Forum name] Topics".

## Implementation

- `apps/web/src/app/(app)/t/[slug]/layout.tsx` gains `generateMetadata`:
  title `"<name> Topics"`, favicon from the forum's settings with the same
  precedence as the topbar/switcher (icon emoji beats uploaded icon URL;
  emoji become SVG data-URI favicons via the new `lib/favicon.ts`).
- The timetable lookup is wrapped in React `cache()` so the layout and
  `generateMetadata` share one GraphQL round-trip — the transport is a
  no-store POST, which Next never dedupes on its own.
- The default 📚 favicon moved from the file convention `app/icon.tsx` to
  config-based `metadata.icons` (same emoji, now a data URI) in the root
  layout. This is load-bearing: file-convention icons take precedence over
  nested `metadata.icons`, so keeping `icon.tsx` would have silently
  blocked every per-forum favicon.
