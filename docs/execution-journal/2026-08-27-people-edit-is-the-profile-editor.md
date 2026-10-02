# People card "Edit" IS the profile editor, and can rename (Ed, 2026-08-27)

Two asks about the admin panel behind **Edit** on a People card
(`PersonAdminPanel` → `MemberRolesEditor`):

- **One click, not two.** The name/bio/photo fields sat behind a second
  "Edit bio & photo" button inside the already-open panel. That button is
  gone: the fields (`MemberProfileFields`, was `BioEditor`) fetch on mount
  and render open. Laziness is unchanged in the way that mattered — the
  component only mounts once an admin opens that card's panel, so the
  People page still doesn't load every profile up front; it's one fetch per
  card an admin actually edits.
- **Admins can edit a member's name.** A Name field now leads the section,
  saved with the bio and photo by the one Save button. `updateMemberBio`
  takes an optional `name` (capped at 120, as `updateMyProfile` does) and
  hands it to `updateMemberProfile`, which already renames the MEMBERSHIP
  (per-forum profiles) and re-derives the member slug — so a rename moves
  the person's profile URL within that forum, exactly as it does when they
  rename themselves. **A blank name means "leave unchanged"**: an admin can
  rename someone, not erase them to nameless.

Details worth knowing:

- The section's own **Cancel is gone** — with the fields always open it sat
  next to the panel's "Close editor" saying the same thing. "Close editor"
  is the single way out and still discards unsaved edits.
- Save now uses `useSavedSnapshot` like the member's own `ProfileForm`, so
  it reads "Saved" until the next keystroke rather than closing the section
  out from under you. `useGqlAction` refreshes the server render, so the
  card above updates to the new name and photo in place.
- The mutation keeps the name `updateMemberBio` although it now writes
  three fields — it's in the default-deny token-scope prose in
  `token-scopes.ts` (deliberately unreachable by API tokens) and renaming
  it buys nothing. Its activity event keeps the stored action
  `member.bio_edit`; the label reads "edited a member's profile" /
  "edited the profile of" now, and the event records the name the member
  ends up with, so the timeline chip names who you'd look for today.
