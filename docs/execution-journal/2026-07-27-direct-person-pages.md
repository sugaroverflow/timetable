# 2026-07-27 - Names and avatars link straight to person pages

## What happened

QA: clicking a username/avatar opened the bio modal, and clicking the
name inside the modal reached the person page — two steps where one will
do. `PersonChip` (the wrapper used by topic bylines, comment authors,
breakdown rows, activity and notifications) is now a plain `Link` to the
person page; the bio modal is deleted (it was purely informational —
photo, name, roles, bio — nothing else lived there).

## The id → slug wrinkle

Chips only know a member's `userId`; person pages resolve by per-forum
member slug. Rather than threading slugs through every comment/heart
payload, chips link `/f/<forum>/<userId>` and the person page grew a
fallback: slug lookup first (so a slug can never be shadowed by an id),
then userId lookup with a redirect to the canonical slug URL. This is
also the "by-id fallback" step toward rename-stable person links noted
in the person-pages journal (2026-07-25).

## Removed

`PersonChip`'s Dialog internals and the orphaned CSS (`.person-modal`,
`.person-modal-photo`, `.person-host-link`, `.modal-backdrop` — no other
Base UI Dialog is currently in the web app). `.person-trigger` survives
as the link style (inherit color, hover underline).
