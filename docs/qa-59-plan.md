# QA round 2 feedback plan (issue #59, Ed's comment 4904029657)

Source: https://github.com/sugaroverflow/timetable/issues/59#issuecomment-4904029657

~35 items grouped into workstreams ordered by risk/dependency. File
references are to the codebase post-PR #56. Product decisions confirmed
with Fatima 2026-07-07: **full theming** (colours + dark mode + fonts),
**off-the-shelf WYSIWYG** (TipTap), **minimal notifications pane now**,
**admin drafts as a Pending Topics section**.

## Answers to Ed's direct questions (no code needed — reply on #59)

- **"Do we have images in our markdown?"** Yes — `![alt](url)` already
  works in bios and topic descriptions. The sanitizer allows `img` with
  `src`/`alt` (`apps/api/src/markdown.ts:10-25`).
- **"When is the timetable url slug set?"** At creation: slugified from
  the name with a uniqueness suffix (`packages/core/src/timetables.ts:40`,
  accepts an explicit slug the UI doesn't expose yet). Not editable
  afterwards. WS-D adds a slug preview/override on the create form.
- **"Custom domain, does this do anything?"** Not yet — it persists only.
  WS-I moves it under a "coming soon" caption so it stops looking broken.

---

## WS-A — Copy & label quick wins

1. **"Host-only comments" → "{hostLabel}-only comments"** ("Faculty-only
   comments") — `HostOnlyPanel.tsx` and anywhere the string appears.
2. **Feed sort "All hosts" → "All {hostLabel plural}"** — `HostFilter.tsx`.
3. **Remove the "Backstage — actions here are logged…" note** on Pending
   Topics (`moderation/page.tsx`).
4. **Remove the Reject button** from Pending Topics (Ed: not needed;
   "Request changes" covers it). Keep the mutation/API for now.
5. **Sidebar "Report a bug" link** to the GitHub issues page (bottom of
   sidebar, external-link icon).

## WS-B — Topic action correctness

1. **Status-aware action bars**: `AdminTopicActions.tsx:79-86` always
   renders "Unpublish" — on an unpublished topic it must show **Publish**
   instead (Ed's repro: /t/spt-test-data/teddy-kelvin/software-development).
   Audit `HostTopicActions.tsx` and `TopicManager.tsx` for the same
   status-blindness; drive all three from `topic.status`.
2. **Pending Topics comments must render threaded** — reuse the feed's
   `CommentList` threading in `ModerationCard.tsx` instead of a flat list.

## WS-C — Profile page

1. New **"Profile" sidebar item** → page to edit profile picture, display
   name, and markdown bio in one place (today it's split/buried). Reuse
   `ProfileForm.tsx` + `ImageUploadField`; bio editor comes from WS-J's
   WYSIWYG once it lands.

## WS-D — Topbar & switcher rework

Interpretation (from Ed's example "🏛️ School of Political Tech Test"):
the topbar keeps only the **current timetable's icon + name** as static
branding/home link; the app-brand logotype and the dropdown switcher go.

1. **Topbar**: current timetable icon + name, links to the feed. No menu.
2. **Timetable switcher moves to the sidebar footer** (Twitter
   account-switcher pattern): each entry shows icon, name, and a
   **visibility pill** (public/hosts-only/…); last item "＋ New timetable".
3. **Create form: show the generated slug** with an optional override
   (core already accepts `input.slug`).

## WS-E — People page

1. **Group by role with headings**: Deans → Faculty → Fellowship
   Candidates (first role wins for multi-role members), heading = the
   custom role label.
2. **Host cards list their topic titles**, each linking to its permalink.
3. **Bigger profile pictures.**
4. **Member editing moves here**: admin Edit control on each person card
   (bio, roles) replaces the Settings → Members dropdown editor
   (`MemberRolesEditor` relocates; Settings keeps invites only).

## WS-F — Feed sorting & host filter

1. **Sort by random**: seeded shuffle — seed generated per visit, carried
   through the infinite-scroll cursor so pages never repeat/overlap.
2. **"Newest" includes content edits**: new `contentUpdatedAt` bumped only
   by host/admin edits to title/body/cover (not status churn); newest
   sorts by `max(publishedAt, contentUpdatedAt)`; the "new since last
   visit" highlight uses the same timestamp. Explicitly **no email/digest
   trigger**. Migration required.
3. **Host filter header card**: filtering the feed by a host renders their
   profile card (avatar, name, bio) above the topics.

## WS-G — Admin drafts on Pending Topics

1. Pending Topics becomes two sections: **"Ready to publish"** (the
   renamed submitted queue) and **"Drafts"** — read-only list of every
   host's drafts (title, host, last edited) so forgotten drafts are
   visible. Drafts stay out of the public feed; no admin actions on them
   beyond viewing (nudging is human).

## WS-H — Activity log upgrade

1. **Group entries under day headings** (with week separators for older
   ranges); **start/end date filter** with date pickers.
2. **Avatars + role labels** on every entry; clicking name/avatar opens
   the `PersonChip` bio modal.
3. **Enriched, linkable entries**: "commented on [topic] ([host])" with
   the comment text and a link to the comment; "hearted [topic] ([host])";
   "invited [user] to [timetable] as [roles]"; new **"logged in for the
   first time"** event (logged on first membership visit — new event
   type).
4. **New filters**: by event type and by role, alongside the existing
   user filter.

## WS-I — Settings reorganisation + full theming

1. **Reorganise**: "Timetable Profile" (name, description, slug display,
   custom-domain field marked coming-soon, **digest defaults at the
   bottom**) and a new **"Theme"** section (colours, cover image, icon,
   fonts, dark palette).
2. **Fix cover image URL / icon URL not applying** — investigate why
   saved values don't render (`SettingsForm.tsx:22-23,68-69` →
   `t/[slug]/layout.tsx:147-150`, `(app)/layout.tsx:40`); convert both
   fields to `ImageUploadField` uploads while there.
3. **Colour tokens**: background, top bar, text, primary — all exposed,
   all live-preview (extend the existing preview machinery), stored in
   `TimetableSettings` (JSON — no migration).
4. **Dark mode**: per-user light/dark/system toggle; the timetable theme
   defines both palettes (dark palette auto-derived from the light tokens,
   admin can override each). All components must read CSS variables only —
   audit `globals.css` for hardcoded colours.
5. **Fonts**: curated dropdown of ~5 self-hosted or Google font pairings
   (heading + body) applied via CSS variables.

## WS-J — WYSIWYG topic editor (TipTap)

1. Adopt **TipTap** (off-the-shelf, per decision — no custom editor) with
   the markdown extension so `bodyMd` stays the source of truth and the
   server-side sanitizer (`renderMarkdown`) remains the safety boundary.
2. **New Topic form order: Title / Cover image / Description**, editor
   default height ≈ its width.
3. Same editor in `TopicEditForm` (feed inline edit, My Topics,
   moderation inline edit) and — stretch — profile/member bios.

## WS-K — My Topics parity with the feed

1. My Topics cards render **identically to feed cards** (cover,
   description, hearts, comments, {hostLabel}-only comments panel) — i.e.
   the feed component filtered to the viewer — with the manage controls
   (edit, submit, feedback thread) appended.

## WS-L — Notifications pane (minimal)

1. Sidebar **"Notifications"** item: comments on your topics + replies to
   your comments, newest first, each linking to the comment; **unread
   count badge** from a `lastSeenNotificationsAt` watermark (same pattern
   as `lastSeenFeedAt`; migration). No per-item read state or mark-all-read
   this round — follow-up issue if wanted.

---

## Suggested phasing

| Phase | Workstreams | Why first |
|-------|-------------|-----------|
| 1 | A, B | Small, zero-risk fixes Ed already noticed |
| 2 | D, E, C | Structural nav/people changes others build on |
| 3 | F, G, H | Feed + admin surfaces |
| 4 | I, J | Theme + editor (largest, most cross-cutting) |
| 5 | K, L | My Topics parity, notifications |

Migrations: `contentUpdatedAt` on topics (WS-F), first-login activity
event (WS-H, data only), `lastSeenNotificationsAt` (WS-L). Theme/font
settings live in the existing settings JSON — no migration.

## Open items deliberately deferred

- Custom domain routing (field stays, marked coming-soon)
- Per-item notification read state / mark-all-read
- WYSIWYG for comments (topics + bios only this round)
