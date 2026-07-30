# People page, profile discoverability & digest name polish (launch QA)

Ed (launch QA). Item 2 of his list — bigger People photos + name titles —
had already shipped in #186 (`.avatar-xl` 96px + the `person-head` layout),
so this pass is the other three.

## 1. Digest: commenter/hearter names are plain, not links

In `apps/api/src/email.ts`, `personLink` was reused for the topic byline,
commenter names, and hearter names. Ed: commenters don't need to be links.
Added `personName` (plain bold `<strong>`) and switched `threadLine` and
`renderHearts` to it; the topic-author **byline still links** via
`personLink`. `forumSlug` threading through `threadLine`/`renderThreadTree`/
`renderDiscussion`/`renderHearts` became dead and was removed (the byline in
`renderCard` still uses it). Tests updated to assert commenters/hearters are
unlinked while the byline link survives.

## 2. Profile discoverability

Account (topbar avatar) menu item relabeled **"Profile" → "Edit Profile"**
(`AccountMenu.tsx`). Ed worried people won't find it there, so the sidebar
**Profile** link is restored in `SideNav` (`f/[slug]/layout.tsx`) — it was
removed in #159 when the account menu subsumed it; now both exist. Sidebar
keeps the short noun "Profile" to match its siblings (People, Analysis…).

## 3. People page: alphabetical + table of contents

Each role section's people are `localeCompare`-sorted by name
(case-insensitive, "Member" fallback). When more than one section is
non-empty, a jump-to-section TOC (`.people-toc`) of pill links renders above
the list; sections carry `id="people-{role}"` with `scroll-margin-top` so
the anchor jump clears the topbar.
