# Comment drafts survive a composer being destroyed (Ed, 2026-08-21)

Ed: draft a comment, switch to another tab on the card, switch back - the
text is gone.

## The fix

**comment-draft-store** (`apps/web/src/lib/commentDrafts.ts`) holds
half-written text in a module-level map keyed by what is being written -
topic + visibility, the comment being replied to, the chain parent, the
comment being edited, slot + topic lens - and `useDraft` is a drop-in for
`useState("")` that reads its initial value back out of that map. A
composer can now be destroyed and rebuilt without the text noticing.

Two wrinkles the map alone doesn't solve. The Reply box and the inline
editor only EXIST while they're open, and that open/closed flag dies with
the unmount - so both start open when `hasDraft` says text is waiting,
otherwise the draft would survive but be unreachable. And "a draft exists"
has to mean "live unsent text", so the discard gestures clear it:
collapsing the Reply box, cancelling an edit, toggling a slot comment's
Edit shut (`clearDraft`, for the case where the parent row discards on
behalf of a composer that is already unmounting).

Deliberately not persisted to `sessionStorage`: surviving a reload is a
different feature, with its own questions about staleness and about
someone else's draft sitting in a shared browser.

## The mechanism - corrected after measuring (same day)

This entry originally blamed topic-tabs unmounting its inactive panes, on
the strength of the note in CLAUDE.md. **That note was wrong, and so was
this entry.** Measured on dev against the deployed build:

- A freshly rendered card has exactly ONE panel in the DOM, the selected
  one. The other panes are not in the page at all.
- Visiting a tab mounts its panel; leaving never removes it. The original
  composer node was still in `document` 8s after switching away, and was
  the same node on return. Base UI unmounts a panel only when its close
  transition completes (`TabsPanel.js:89-96`), and these panels have no
  transition, so that never fires.

So each pane's fetch is still lazy - it can't run before its panel exists
- but plain tab switching does NOT destroy a composer, and could not have
lost Ed's draft on its own. What IS verified to destroy one is a route
change: typing a comment, opening Calendar from the sidebar and coming
back gave a fresh page whose composer the store correctly refilled.

The exact trigger Ed hit (he reports the sessions-tab on a topic card) is
still unexplained; the remaining candidates are the comment-teaser folding
a tree - which does unmount the reply and chain-tail composers inside it -
and a card remount. The store covers all of them, which is why the fix
stands regardless, but the mechanism should not be restated as fact
without a fresh measurement.

The other consequence of lazy mounting is real and load-bearing: an
unvisited pane is not in the page, so a deep link into one must NAME its
tab. That is what the `?tab=` aiming in the notification and digest reply
links exists for.

The rule of the house: a comment composer uses `useDraft`, never
`useState("")` - anything inside a card can be taken out from under it.
