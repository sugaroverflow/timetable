# 2026-09-30 — Image upload in the rich-text editor (editor-image-upload)

## The ask

While building the {host} Lounge, Ed learned the editor's image button
only took a pasted web address — in topics too. He chose option 6 of
three: real uploads, for topics and the Lounge, at the same public-but-
unguessable addresses as covers and profile photos.

## Why this shape

- Pasted links can't use a photo on your device, most share links aren't
  direct image links, pictures vanish when their host moves them (bad for
  topics meant to become reusable articles), and readers' browsers fetch
  from a third party.
- The upload machinery already existed (signed PUT straight to Spaces),
  so this is a new purpose plus editor wiring.
- Truly private Lounge images would mean serving every image through the
  API behind a sign-in check. Not built; the Lounge composer says plainly
  that pictures can be opened by anyone with their link.

## What was built

- API: upload purpose `post-image` (hosts and admins, like topic covers),
  keyed under the forum. Integration test: electors refused, hosts signed.
- Web: `lib/uploadImage.ts` — the one upload path (moved out of
  `ImageUploadField`) and `shrinkImage` (≤1600px long edge, WebP, JPEG
  fallback on white; GIFs untouched). `RichTextEditor` takes
  `uploadForum`; with it the image button opens a file picker (several at
  once), and pasting or dropping images uploads them, with an "Uploading
  image…" status. Wired into topic create/edit and both Lounge editors.
  Profile bios keep the URL prompt (electors can't upload post images).
