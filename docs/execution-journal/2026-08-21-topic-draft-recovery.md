# Topic drafts survive leaving the page (Ed, 2026-08-21)

Ed wrote a lot of text drafting a topic, accidentally opened a different
page, pressed browser Back - and the work was gone.

Nothing was saving it. The composers held title/description/cover in
plain `useState`, which dies with the component, and browser Back
re-mounts the page empty either way. The comment-draft-store built
earlier the same day doesn't help here: it is a module-level map, so it
survives an unmount but not a page load, and it was scoped to comments.

`useStoredDraft` (`apps/web/src/lib/formDrafts.ts`) writes the composer's
fields to **sessionStorage** instead. That is the level that matches the
accident: it survives navigation within the app, a hard page load, Back,
and a reload - and it is dropped when the tab closes, so a half-written
topic never sits waiting for whoever uses the machine next. localStorage
would also survive closing the tab, at the cost of that exposure; worth
revisiting if losing a draft to a closed tab ever comes up.

Details that took thought rather than typing:

- **Restore after mount, not during render.** The server rendered an
  empty form; filling it in during hydration is a mismatch. So the
  restore is an effect, and it only fires while the form is still equal
  to its baseline, so a fast first keystroke is never clobbered.
- **The baseline is what "a draft" means.** Empty for a new topic, the
  saved content when editing. A record equal to the baseline is not a
  draft - an untouched editor stores nothing, and typing back to the
  original clears what was stored. Same shape as `useSavedSnapshot`.
- **Writes are debounced 300ms.** Serialising a long body on every
  keystroke is real jank for no benefit.
- **Every storage call is wrapped.** Private mode, a full quota or
  disabled storage must not stop anyone writing a topic; recovery is a
  convenience, never a precondition.
- **The recovery announces itself.** Silently refilling a composer is
  startling when you had deliberately abandoned the draft, so
  `DraftRestoredNotice` says so and offers Discard.

The rich-text editor was the one thing that could have quietly broken
this: a restore lands after mount, so an editor that only read `value` on
first render would hold the text in state and show an empty box. It
already syncs external changes (`editor.commands.setContent`), so it
displays.

The rule of the house: long-form composers use `useStoredDraft`;
one-line composers use the in-memory comment-draft-store.
