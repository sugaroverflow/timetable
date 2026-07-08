# QA round 3 feedback plan (issue #59, Ed's comment of 2026-07-08)

Source: Ed's third feedback comment on #59 (~27 items). Decisions confirmed
with Fatima 2026-07-08: **drop the "Request changes" action entirely**
(admin comments replace it) and **full impersonation** for
"View timetable as [username]" (with read-only + audit safeguards).

## Not code — answers & environment actions

- **Uploads fail with "Failed to fetch"** (profile image, cover, icon): the
  browser PUTs directly to the Spaces bucket with a signed URL; the bucket's
  CORS must allow PUT from `https://dev.timetable.love`. Fix is infra:
  `SPACES_BUCKET=timetable SPACES_REGION=lon1 scripts/configure-spaces-cors.sh`
  (see DEPLOYMENT.md §uploads). WS-P adds a clearer client error so a CORS
  failure doesn't read as a mystery.
- **Google SSO**: a Clerk dashboard toggle (enable the Google connection on
  the production instance); no app code needed.
- **Email logo**: the emails Ed sees are Clerk auth emails — branding is set
  in the Clerk dashboard. Our digest emails are currently logo-less text.
- **What can a role-less member see?** Today `roles: []` fails every role
  gate: they see what an anonymous visitor sees (per the timetable's
  visibility level) plus the timetable in their switcher. WS-T makes this
  explicit and consistent (People page hidden, no composer) and documents it.

## WS-M — Quick wins (copy, visibility, CSS)

1. "Show/Hide vote breakdown" → "Show ❤️ breakdown" / "Hide ❤️ breakdown"
   (`HostInsightsPanel`).
2. Nav + page head: "My hearted topics" → "❤️ Topics".
3. Remove the "Changes requested — edit and resubmit when ready" copy
   (superseded by WS-S anyway).
4. Dashboard: "Elector activity" → "{electorLabel} activity"; host
   leaderboard ("All Faculty by weighted votes") rendered for admins only;
   remove the "Unallocated published topics" section.
5. Topbar: hide the user email on mobile (media query).
6. Feed desktop typography: bump avatar size, topic-title size, and byline
   size at the desktop breakpoint.

## WS-N — Theme round 2

1. New `topbarText` colour token (light + dark), applied to `.topbar`
   text/brand; picker in the Theme form.
2. Expose **dark-mode Primary and Secondary** pickers (schema already
   supports `theme.dark.primary/secondary`; UI only offered bg/topbar/text).
3. Move the light/dark toggle from the topbar to the Profile page.
   Signed-out visitors follow their system preference (no toggle).

## WS-O — Shell & nav fixes

1. **Sticky sidebar on desktop**: cap it at
   `max-height: calc(100vh - 40px)` with internal overflow so `position:
   sticky` actually pins (a sticky element taller than the viewport scrolls
   with the page — likely what Ed saw).
2. **Mobile hamburger in the topbar**: remove the in-content "☰ Menu"
   button; hamburger at the left of the topbar toggles the sidebar drawer
   (shared client store between the topbar and the timetable shell, same
   pattern as the theme store).
3. **Signed-out topbar identity**: on a public timetable, anonymous
   visitors currently get the app logo + "Timetable". `TopbarBrand` gains a
   fallback that resolves the current slug's icon + name via the public
   GraphQL endpoint when it isn't in the signed-in items list.

## WS-P — Profile in the shell + upload UX

1. New `/t/[slug]/profile` route rendering the profile editor (name,
   avatar, markdown bio, digest prefs, theme toggle per WS-N) inside the
   timetable shell; the sidebar Profile link points there. `/profile`
   remains for timetable-less contexts and redirects into the last-engaged
   timetable when one exists.
2. Upload client: distinguish signed-URL fetch failures from bucket-PUT
   failures; a CORS-blocked PUT shows "Storage isn't accepting uploads from
   this site yet" with the paste-a-URL fallback still available.

## WS-Q — Notifications reply button

Each notification gets **Reply** → topic permalink with a
`?reply={commentId}` param; the topic page focuses the right composer
(reply composer for that comment, top-level composer for comments on your
topic) and scrolls to it.

## WS-R — Dashboard analytics

1. "All topics by weighted votes": per-topic **Show/Hide ❤️ breakdown**
   collapsible listing the per-elector weights (data already exists on the
   feed path; expose `weightedBreakdown` on the dashboard leaderboard).
2. **{Elector} activity start date**: date picker filtering activity
   (hearts/comments/availability counts) to on-or-after the chosen date;
   defaults to the timetable's hearts cutoff (`heartsCountFrom`) when set.
   Server-side filter on the dashboard query.

## WS-S — "[Admin] comments" replace draft feedback (largest)

New comment visibility **`admin_only`** (enum migration 0013):

- Visible only to admins and the topic's owner, threaded like other
  comment threads, labelled "{adminLabel} comments".
- Composer/panel placement per Ed: admins see it on **Pending Topics**
  only; the owner sees it on **My Topics** only; it never renders in the
  feed for anyone.
- **"Request changes" is removed entirely** (per decision): the moderation
  actions become Publish and Edit; the `moderateTopic` request_changes
  branch, the feedback box, the `feedback` field, and the "changes
  requested" copy all go. Admins communicate via the thread; hosts edit and
  resubmit on their own.
- **Data migration**: existing `host_only` comments on topics currently in
  draft or submitted status (the old feedback threads) become `admin_only`.
  `host_only` comments on published topics stay Faculty-only.
- **Notifications + digests**: admin comments notify the topic owner;
  owner replies notify via the reply path (visible to admins on the
  notifications pane); digests treat them like other comments in the
  replies / activity-on-your-topics sections. Notification/digest queries
  must respect the admin_only visibility rule.

## WS-T — People: remove members + role-less definition

1. **Remove from timetable**: admin-only action in the People edit panel —
   new `DELETE /api/memberships/:id` (owner membership protected, activity
   logged, confirm dialog). Removed users lose access immediately.
2. Role-less members: enforce the documented behaviour (anonymous-level
   visibility + switcher presence) and add it to PRODUCT.md.

## WS-U — View timetable as [username] (full impersonation)

Replaces the "View as fellowship candidate" toggle:

- People page (admins only): **"View timetable as [username]"** per member.
- A signed, httpOnly, per-timetable cookie stores the target userId. On
  every request the server re-checks that the *actual* viewer is an admin
  of that timetable before applying it — the cookie alone grants nothing.
- While active, reads resolve as the target user (their roles, hearted
  state, notifications, My Topics — per the full-impersonation decision),
  scoped to that timetable only.
- **Safeguards**: all mutations are blocked while impersonating (read-only
  preview — acting as another user would corrupt attribution); starting and
  stopping impersonation is activity-logged (`member.impersonate`); the
  sidebar shows a persistent **"Exit [username] preview"**.
- `previewRoles.ts` / `PreviewToggle` are removed in favour of this.

## Suggested phasing

| Phase | Workstreams | Notes |
|-------|-------------|-------|
| 1 | M, N, O | Small fixes Ed already noticed; no migrations |
| 2 | P, Q, R | Profile/notifications/dashboard |
| 3 | S | Migration 0013 + data migration; touches moderation, digests |
| 4 | T, U | Membership removal, then impersonation (security review last) |

Infra to schedule alongside: run the Spaces CORS script for dev (and later
prod) origins; Clerk dashboard: Google connection + email branding.

Migrations: 0013 `admin_only` comment visibility + feedback-thread data
migration. Impersonation uses a signed cookie, no schema change.
