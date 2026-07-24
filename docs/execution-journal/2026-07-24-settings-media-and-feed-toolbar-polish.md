# 2026-07-24 - Settings Media Polish + Sticky Feed Toolbar

## Goal

Production-QA polish (first live pass): make cover image and icon removable
again, add image-size hint text, let the cover render at any aspect ratio,
and restyle the feed filter row as a compact sticky header.

## Changes

- `apps/web/src/components/SettingsForm.tsx`: the save mutation now sends
  trimmed strings (possibly empty) for `cover`/`icon`/`emoji` instead of
  `null`. The API treats a `null` arg as "leave unchanged" and an empty
  string as "clear", so clearing a field never persisted — this was the
  "can't remove a cover image or icon once set" bug. Also moved the icon
  sizing guidance from the label into new hint text on both image fields.
- `apps/web/src/components/ImageUploadField.tsx`: optional `hint` prop
  (faint text under the label) and a "Remove image" ghost button under the
  preview that clears the value.
- `apps/web/src/app/(app)/t/[slug]/layout.tsx` + `globals.css`: the
  timetable cover is now a real `<img>` at its natural aspect ratio
  (was a background-image div hard-capped at 75px tall) — the uploader
  decides how tall the cover is. `.topic-cover` keeps the old cropping
  rules; the shared rule was split.
- `globals.css` + `feed/page.tsx`: new `.feed-toolbar` variant of
  `.toolbar` for the feed's sort/host filter row — sticky beneath the
  topbar (new `--topbar-h` token in `tokens.css`), flush on the page
  background with no card surface, border, radius, or shadow, and
  smaller (`--text-xs`) selects. Other `.toolbar` uses are unchanged.
- `apps/web/src/components/FeedSortControl.tsx`: the sort select now has
  `id="sort"` so the toolbar's `<label htmlFor="sort">` actually points
  at it.

No schema or API changes.
