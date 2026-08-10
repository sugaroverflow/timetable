# 2026-08-10 — Clerk UI: hide the second "profile", theme to tokens

Ed's QA (product feedback round 3): "Account & security" in the account
menu opens Clerk's modal, whose first section is *also* a Profile —
name and photo — reading as a confusing rival to the per-forum Topic
profile. Worse than cosmetic: Clerk's name/image are mirrored into the
local `users` row **once, at first sign-in** (`onConflictDoNothing`,
never synced again), so edits there change nothing in the app.

One change in the web root layout (`layout.tsx`) — an `appearance`
config on `ClerkProvider`, which covers the sign-in/sign-up cards and
the account modal alike:

- **`elements.profileSection__profile: { display: "none" }`** hides the
  dead-end Profile section. Email addresses, connected accounts,
  password, sessions, and delete-account stay self-serve — the parts
  only Clerk should own (the AccountMenu design note's original
  intent). Verified the section id against Clerk's localization keys
  (`userProfile.start.profileSection`); the `descriptor__id` targeting
  form is Clerk's documented recipe.
- **`variables`** map Clerk's palette onto our semantic tokens
  (`--primary`/`--primary-ink`, `--card`, `--ink`, `--muted`, `--line`,
  `--radius-md`, `--sans`) as CSS-variable strings, so Clerk UI tracks
  light/dark and per-forum themes with no duplicated values. Note the
  Clerk v7 variable names (`colorForeground`, `colorMutedForeground`,
  `colorInput`, `colorInputForeground`) — the widely-documented v4
  names (`colorText` etc.) typecheck fine but are silently ignored,
  because the appearance prop is loosely typed until the registry is
  augmented.

Not done here, dashboard-side (Ed): Clerk email templates/from-address,
"Secured by Clerk" badge removal, and enabling the "Email link"
sign-in strategy (mobile-friction follow-up).

No local Clerk keys on this machine (no `.env`), so visual QA happens
on dev after merge: sign-in card picks up tokens, account modal opens
without the Profile section, dark mode tracks.
