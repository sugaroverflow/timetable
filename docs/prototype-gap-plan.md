# Prototype gap analysis & implementation plan

Date: 2026-07-03. Compared `timetable.html` (the interactive prototype;
`prototype.html` is an identical copy) against the app on `main` at `ec317eb`.

## Part 1 — Gap analysis

### What already matches

The app implements every screen and core workflow in the prototype: topic feed
with weighted hearts and threaded comments, host insights panel, host topic
manager, availability calendar with per-slot 🟢🟡🔴 marking, weekday pattern
tool, audience/location filters, host/admin slot discussions, moderation queue
with request-changes feedback, activity log, and settings (profile, privacy,
custom domain, theme colours, role labels, invites, member role matrix). A
prior parity pass (PR #45) covered the visual basics: slot date widget, comment
bubbles, slot-expand rows, shell polish.

The app also exceeds the prototype: multi-tenancy with per-timetable roles,
dashboard analytics, ICS export, object-storage uploads, feed pagination,
slot conflict alerts, and weekly-repeating slot creation.

### Verified gaps (by direct code inspection)

| # | Gap | Prototype reference | App state |
|---|-----|--------------------|-----------|
| 1 | Dashboard has no nav entry | n/a (app-only page) | Built, unreachable except by URL — nav in `apps/web/src/app/(app)/t/[slug]/layout.tsx:139-159` lists everything else |
| 2 | Toast feedback on actions | `toast()` fires for heart/comment/moderate/save/invite | No toast system in `apps/web`; errors use `alert()` (`HeartButton.tsx:29`, `ModerationCard.tsx:34`) |
| 3 | Empty states | "Queue is clear", "No slots match" cards | None found in `apps/web/src` |
| 4 | Availability labels + legend | Buttons say "Available / Maybe / Can't"; legend above slot list | `AvailabilityControl.tsx:13-15` renders emoji only; calendar page has no legend |
| 5 | "N electors in view" count | Shown beside calendar audience filter | Not rendered; calendar query already returns `perUser` for host/admin so the data is available |
| 6 | Elector's own vote weight | "your vote: 1/n" chip on hearted cards | `HostInsightsPanel` is host/admin-gated; electors never see their weight |
| 7 | Admin edit from moderation | "Edit" action on queue cards | `ModerationCard.tsx:73` links to `/t/[slug]/topics` — the host-only "my topics" page, where an admin sees their *own* topics, not the submitted one. The `updateTopic` mutation already authorizes admins (`apps/api/src/graphql/schema.ts:530`) |
| 8 | Timetable-level default digest settings | Settings panel: "New members start with these" | Only per-user `DigestSettingsForm` on `/profile`; timetable `settings` jsonb has no digest defaults |
| 9 | Live settings preview | Colour picker / role renames update the page live | Forms save then re-render; no live preview |
| 10 | Heart pop animation | `.heart-pop` keyframes, reduced-motion guarded | Not present in `globals.css` |
| 11 | "Viewing as" perspective switch | Elector/Host/Admin toggle in topbar | No way for a host/admin to preview the elector view |
| 12 | Dead `"unlisted"` privacy branch | n/a | `t/[slug]/page.tsx:64` references a privacy value not in the enum (deactivated/private/public) |

### Deliberately out of scope

Spec-level items already tracked in `docs/PRODUCT.md` (Known Gaps / Go-Live
Checklist), not prototype gaps: WhatsApp/Matrix/webhook notification channels,
two-way calendar sync, cursor-based infinite scroll, verified Resend sender,
storage/DNS/Clerk production configuration.

## Part 2 — Implementation plan

Six phases, ordered by value-for-effort. Each is independently shippable as
its own PR. Only Phases 4–5 touch the API, and the only "schema" change is a
new key inside an existing jsonb column (no migration).

### Phase 1 — Loose ends (S)

**1.1 Dashboard nav link**
- File: `apps/web/src/app/(app)/t/[slug]/layout.tsx` (nav block, lines 139–159).
- Add `<NavLink href={`${base}/dashboard`}>Dashboard</NavLink>` gated by the
  same host-or-admin rule the dashboard page enforces.
- Accept: admin and host see the link; elector-only member does not; link
  active-state matches other NavLinks.

**1.2 Remove dead `"unlisted"` branch**
- File: `apps/web/src/app/(app)/t/[slug]/page.tsx:64`.
- Delete the branch; confirm copy for the three real privacy values is right.
- Accept: typecheck passes; overview renders for all three privacy modes.

**1.3 Admin edit from the moderation queue**
- File: `apps/web/src/components/ModerationCard.tsx` (replace the `Edit` link
  at line 73 with an inline edit toggle: title input + body textarea +
  cover-image field, pre-filled, submitting via the existing `updateTopic`
  mutation).
- Check `updateTopic` writes an `activity_events` row when the actor is not
  the host; add if missing so admin edits appear in the activity log.
- Accept: admin edits a submitted topic from the queue and the change
  round-trips; host sees updated content on their `/topics` page; activity
  log records the edit; a host without admin cannot hit the path.

### Phase 2 — Interaction feedback (M, client-only)

**2.1 Toast system**
- New: `apps/web/src/components/Toast.tsx` — `ToastProvider` (context +
  portal) and `useToast()`. Port the prototype's `.toast` / `.toast-wrap`
  styles into `globals.css`, including the `rise` animation and the existing
  `prefers-reduced-motion` guard pattern.
- Mount the provider in `apps/web/src/app/(app)/layout.tsx`.
- Replace `alert()` error paths and add success toasts in: `HeartButton`,
  `CommentComposer`, `CommentActions`, `CreateTopicForm`, `TopicManager`,
  `ModerationCard`, `AdminTopicActions`, `AvailabilityControl`,
  `WeekdayPatternControl`, `SlotAdminForm`, `SlotAdminControls`,
  `SlotDiscussion`, `SettingsForm`, `TimetableProfileForm`, `InviteForm`,
  `MemberRolesEditor`, `ProfileForm`, `DigestSettingsForm`.
- Accept: hearting shows a toast; a failed mutation shows an error toast
  instead of `alert()`; toasts stack and self-dismiss (~2.2s, as prototype).

**2.2 Empty states**
- New: `apps/web/src/components/EmptyState.tsx` (icon, title, hint — port of
  the prototype's `.empty`).
- Use in: feed (no topics / filter matches nothing), calendar (no slots /
  location filter matches nothing), moderation ("Queue is clear"), activity
  (no events), timetables index (no memberships yet).
- Accept: each page shows the empty card instead of a blank region.

**2.3 Heart pop animation**
- Port `.heart-pop` keyframes to `globals.css`; trigger in `HeartButton` on
  heart (not on unheart), re-triggerable via class remove/re-add.
- Accept: animates on heart, not unheart; disabled under reduced motion.

### Phase 3 — Calendar affordances (S–M)

**3.1 Availability control labels**
- File: `apps/web/src/components/AvailabilityControl.tsx` — add
  "Available / Maybe / Can't" text beside the colour indicators, as the
  prototype's segmented control (`.avseg`). Keep `aria-label`s.
- Accept: labels visible on desktop; control still usable at 375px width.

**3.2 Legend**
- File: calendar page — add the prototype's legend row (green Available,
  yellow Maybe, red Can't) above the slot list.

**3.3 "N electors in view"**
- File: calendar page + `AudienceFilter.tsx` area. For host/admin viewers,
  derive the audience size from the existing `perUser` payload (count of
  distinct users across returned slots), or expose an explicit
  `audienceCount` on the `calendar` query if slots can have disjoint
  `perUser` sets. Render "N electors in view" beside the filters.
- Accept: count updates when the audience filter changes; hidden for
  electors.

### Phase 4 — Feed parity: elector vote weight (S API + S web)

**4.1 Viewer weight field**
- API: expose the signed-in viewer's published-hearted count — simplest as a
  field on the feed/timetable payload (e.g. `viewerHeartedPublishedCount`),
  reusing the existing weighted-heart computation in `packages/core` (do not
  recompute client-side). Available to any member, not host-gated — it is
  the viewer's own data.
- Web: in `TopicCard`'s actions row, when the viewer has hearted the topic,
  render the prototype's chip: `your vote: 1/n`.
- Tests: API test that the field counts only published, non-archived hearts
  and is viewer-scoped; anonymous viewers get null.
- Accept: elector hearts two topics → both cards show "your vote: 1/2";
  unhearting one updates the other to "1/1" after refresh.

### Phase 5 — Settings parity (M)

**5.1 Timetable default digest settings**
- DB: add `digestDefaults` (same shape as user `notificationSettings`) inside
  the timetable `settings` jsonb — no migration needed; update the settings
  Zod/validation shape in `packages/shared`.
- API: accept it in `updateTimetableSettings`; apply defaults to a user's
  `notificationSettings` at membership creation (invite acceptance in
  `myTimetables` claim path + timetable creation) — only for settings the
  user hasn't explicitly changed, or simplest: seed at membership creation
  and never after.
- Web: add the prototype's "Default digest" toggle panel to `SettingsForm`;
  copy: "New members start with these. Each person can change their own."
- Accept: admin flips a default off; a newly invited member's profile shows
  it off; existing members are untouched.

**5.2 Live preview in settings**
- Files: `SettingsForm.tsx` (+ the shell that sets CSS variables /
  role labels). Apply theme colour and role-label changes optimistically to
  the current page as the admin types (client state driving the existing CSS
  variables), reverting on discard, persisting on save. Add the prototype's
  role-usage preview line ("A Host proposes topics; an Elector hearts…").
- Accept: typing a new primary colour recolours the shell immediately
  without saving; discard restores; reload after save shows the new theme.

### Phase 6 — "Viewing as" perspective switch (M, needs product sign-off)

The prototype's topbar toggle is partly a demo device, but it answers a real
question the spec raises ("if a user is a host AND an elector, how do you
choose which you want to see?"). Proposed safe version:
- A client-side "Preview as elector" toggle in the timetable shell, shown
  only to members with host/admin roles.
- It only ever *removes* UI (insights panels, slot discussions, admin
  actions, backstage nav items); server authorization is untouched, so it
  can never widen access.
- State in a cookie or URL param so it survives navigation within the
  timetable.
- Decide before building: is this a preview tool (recommended) or a real
  mode-switch that also changes which composer/actions render?

### Sequencing & estimates

| Phase | Size | Depends on | PR |
|-------|------|-----------|----|
| 1 Loose ends | S | — | 1 |
| 2 Feedback (toasts/empties/animation) | M | — | 2 |
| 3 Calendar affordances | S–M | — | 3 |
| 4 Vote-weight chip | S | — | 4 |
| 5 Settings parity | M | — | 5 |
| 6 View-as | M | product decision | 6 |

Phases are independent; 1–4 can proceed in any order. Phase 2 first is
recommended after 1, since later phases' actions should use toasts rather
than adding more `alert()` calls.

### Verification (each phase)

- `npm run test --workspaces --if-present`, `typecheck`, `lint`, `build`.
- Extend API tests for the Phase 4 field and Phase 5 defaults.
- Playwright smoke additions: toast appears on heart; moderation edit
  round-trips; dashboard nav visible to admin, absent for elector.
- Manual: seeded dev (`npm run db:seed && npm run dev`), walk elector → host
  → admin through feed / calendar / moderation / settings side-by-side with
  `timetable.html` open in a browser.
