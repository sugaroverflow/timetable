# One account control: app avatar menu replaces Clerk's UserButton

**Date:** 2026-07-28

Ed's QA: account controls lived in three places — Clerk's UserButton
(top right), the topbar email link, and the sidebar's Profile entry —
and Clerk's modal offered a name/photo editor that does nothing now that
profiles are per-forum.

Now there's one control: `AccountMenu`, the viewer's per-forum avatar in
the topbar opening a Base UI menu (matching the forum switcher's
styling) with **Profile** (forum profile page, or /profile outside a
forum), **Account & security** (Clerk's modal via `openUserProfile()` —
email, password, sessions stay Clerk's), and **Sign out**. The avatar
resolves the forum from the pathname client-side (TopbarRoles pattern)
via a new public-API field `Forum.viewerProfile { name image }`
(resolver over `getPerson`; null for anonymous/non-members). Email link
and sidebar Profile entry removed.

Remaining for Ed (dashboard, not repo): disable the name/profile-image
fields on the Clerk instance so its modal stops offering the
do-nothing identity editor.
