# 2026-09-30 — Contact Details (members-only profile box)

## The ask

Ed: "On public forums, users have asked for an area in their bio that
remains closed to people [not] on the forum (e.g. for contact details)."

Until now a bio followed the forum's privacy level: on a `public` forum
anyone on the internet — search engines included — could read every
member's bio, so there was nowhere to put an email address or phone
number meant only for fellow members.

## Decisions (Ed)

1. **A second free-text box**, not structured contact fields (which would
   mean choosing which channels to support) and not a hidden block inside
   the one bio (one parser bug leaks exactly what people chose to hide).
2. **Audience: every forum member** — electors, hosts, admins. A
   deactivated member resolves to no roles and loses sight with everyone
   else.
3. **Available on every forum**, private ones too, for consistency (a
   forum can change level).
4. **Naming.** "Private Profile" would invite two whole profiles; Ed chose
   **"Contact Details"** for the members-only box, and for the bio
   **"Public Profile"** where the public can actually read it, plain
   **"Profile"** otherwise (private forums; electors on hosts-only ones).
5. **Left out of the JSON export** — no one-click harvest of everyone's
   contact details.
6. **Above the profile**, not below, everywhere it appears.

## What was built

- Migration 0043 adds nullable `timetable_memberships.contact_details`
  (additive — term-time safe).
- `packages/shared/src/permissions.ts`: `canSeeContactDetails(viewer)`
  (member or sysadmin) and `isProfilePublic(privacy, personRoles)`.
- API: `Person.contactDetails` / `contactDetailsHtml`, nulled in
  `personForViewer` for anyone who fails the rule; `updateMyProfile` and
  the admin `updateMemberBio` accept `contactDetails` (omit = unchanged,
  "" clears; capped at 1,000 characters). Integration tests prove the
  public and signed-in non-members get null while members get the text.
- Web: the profile editor leads with Contact Details, then the
  "Public Profile"/"Profile" section, each with a line saying who sees it
  (`lib/profileLabels.ts`); the admin editor on People cards gets the same
  box first. Readers see it above the bio on person pages, the
  host-filtered All Topics header and People cards, with a 🔒 "Members
  only" note where the surrounding profile is public.

## Worth knowing

- Members-only protects against the internet and passers-by, not against
  someone who joins in order to read it; and removal doesn't un-see what
  was read. The editor copy says "Only members of this forum can see
  these" and nothing stronger.
