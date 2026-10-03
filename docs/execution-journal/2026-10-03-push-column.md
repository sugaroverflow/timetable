# 2026-10-03 — Web Push step 5: the Push column (#368)

## The ask

Step 5 of `docs/web-push-plan.md` §6. Ed's ruling (2026-10-03): "We have
push settings on the notifications tab alongside digest settings… table of
settings with two columns, email and push." The spec is plan §1 ("In their
words", "What is on screen") and the §6 step 5 row:

- "What to include" becomes a two-column **Email | Push** list of the
  existing kinds;
- it shows even when the email cadence is Never, with the Email column
  greyed out;
- `drafts` has a dash in its Push cell;
- it saves through the same mutation.

It ships inert. While `pushPublicKey` is null (no VAPID keys, or an admin's
view-as preview) the form must look and save exactly as before. Step 6
(the sidebar link) was built at the same time, so this PR stays out of the
forum layout and the sidebar. It also touches no `apps/api` or `packages/*`:
#379 already had the API it needed.

## What we built

1. **`DigestSettingsForm`** (push-column) takes a new optional prop,
   `pushKinds`: the viewer's effective Push switches.
   - **Absent or null:** the old "What to include" list renders through the
     same markup, now `EmailKindList`. It is still hidden at Never, and the
     form sends the old mutation with the old variables.
   - **Present:** "What to include" is a `<table>` (`KindTable`).
     - The header row is "What to include" | "Email" | "Push".
     - Each kind is a row: a row header with the label, then a bare Email
       switch and a bare Push switch. Their accessible names are
       "{label}: Email" and "{label}: Push".
     - `drafts` (`isPushEventlessKind`) shows "—" in its Push cell, with a
       hidden "No push alerts" for screen readers and a tooltip.
     - Admins' greyed rows (kinds that don't apply to them) keep both
       switches disabled, as before.
     - At Never, the table stays, the Email header and switches grey out
       (disabled), and Push stays usable.
   - **Save:** `MUTATION_WITH_PUSH` is the same
     `updateMyForumDigestSettings` with `pushKindsJson: $p`. `p` carries
     every Push switch the viewer can use (applicable kinds, `drafts`
     excluded), mirroring how `kindsJson` sends only usable email
     switches. The API replaces the stored set (#379), so inapplicable
     kinds fall back to `PUSH_KIND_DEFAULTS`. The toast reads
     "Notification settings saved" in this mode.
   - `parseViewerPushKinds` reads `Forum.viewerPushKinds`. Junk reads as
     `{}`, which means all defaults.
2. **`Switch`** takes an optional `ariaLabel` and an optional `label`. With
   no label it renders only the track (a table cell's row and column say
   what it is). Existing callers render byte-for-byte the same.
3. **Notifications page** (`f/[slug]/notifications/page.tsx`) selects
   `viewerPushKinds` on the aliased `timetable: forum(...)`. It passes
   `pushKinds` under the alerts line's own gate, `pushPublicKey` non-null
   and not previewing, so the line and the column appear and disappear
   together.
4. **CSS** (`globals.css`, `.kind-table*`): the switch columns are
   `width: 1%` with `white-space: nowrap`, so they take only a switch's
   width. The label column takes the rest and wraps. The headers are
   `--text-xs` semibold `--muted`. No hex, tokens only.

`AlertsLine` stays where #381 put it, directly above "What to include".
The plan's §1 layout ("Above the list, one line covers this device") agrees.

## Proving nothing changes without keys

- **Before the change:** a throwaway jsdom harness rendered the original
  `DigestSettingsForm` (elector daily, admin weekly with a stored switch,
  host at Never). For each case it dumped `container.innerHTML` and the
  `clientGql` call a Save makes.
- **After the change:** the same harness, with no `pushKinds`, produced a
  **byte-identical** dump (same SHA-256). The harness was not committed.
- **Pinned for the future:** `DigestSettingsForm.test.tsx` covers:
  - no table and no Email/Push headers;
  - switches named by their visible labels;
  - the list hidden at Never;
  - a mutation without `pushKindsJson`, with exactly `s e f w k`;
  - the old toast.

## Tests

`apps/web/src/components/DigestSettingsForm.test.tsx` (jsdom, after
`QueueControls.test.tsx`), 12 cases:

- without push: list, Never, save;
- with push:
  - columns and defaults;
  - the `drafts` dash;
  - values read from `viewerPushKinds`;
  - at Never, Email disabled and Push usable;
  - picking a cadence re-enables Email;
  - one save carries both `k` and `p`, with `drafts` absent from `p`;
  - a save at Never leaves the frequency unset;
  - an admin sends only applicable kinds;
- `parseViewerPushKinds`.

## Mobile

At 360px the table fits with no horizontal scroll (`scrollWidth` 360 in
the harness shots). The two switch columns take about 100px, and labels
wrap in the rest. Nothing here is a tab strip, so the topic-tabs strip
rules don't apply. There are no fragment links, so the `next/link` gotcha
doesn't either.

## Screenshots

Harness pages: the jsdom render of the real form, put in a page with
`tokens.css` and `globals.css`, then shot by Playwright's Chromium (1234)
at 360px light and 1280px dark. The alerts line in them is static markup
copied from `AlertsLine`'s off state. Three states: push with daily, push
at Never, and no push.

## Left open

- The card title stays "Email digests"; the plan doesn't retitle it. It is
  open call 1 on PR #384.
- No glossary entry: plan step 7 owns the push docs. The part name is
  **push-column**.
