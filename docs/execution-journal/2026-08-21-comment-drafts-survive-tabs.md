# Comment drafts survive a tab switch (Ed, 2026-08-21)

Ed: draft a comment in the comments tab, switch to the calendar tab,
switch back - the text is gone.

Working as built, unfortunately. `TopicTabs` renders Base UI `Tabs.Panel`s
at their default `keepMounted={false}` (`TabsPanel.js:37,110`), so the
inactive panel's whole subtree unmounts - and that unmounting is load-
bearing: it's what keeps the Sessions and Scheduling tabs' fetches lazy
(`sessionSlotCount` exists precisely so the tab can be gated without
fetching rows). `keepMounted` would fix the drafts and cost every card
every tab's data, so it was never an option.

So the draft moves instead of the panel. **comment-draft-store**
(`apps/web/src/lib/commentDrafts.ts`) holds half-written text in a
module-level map keyed by what is being written - topic + visibility, the
comment being replied to, the chain parent, the comment being edited, slot
+ topic lens - and `useDraft` is a drop-in for `useState("")` that reads
its initial value back out of that map. The composer can now be destroyed
and rebuilt without the text noticing.

Two wrinkles the map alone doesn't solve. The Reply box and the inline
editor only EXIST while they're open, and that open/closed flag dies with
the unmount - so both now start open when `hasDraft` says text is waiting,
otherwise the draft would survive but be unreachable. And "a draft exists"
has to mean "live unsent text", so the discard gestures clear it:
collapsing the Reply box, cancelling an edit, toggling a slot comment's
Edit shut. `clearDraft` exists for that last case, where the parent row
discards on behalf of a composer that is already unmounting.

Deliberately not persisted to `sessionStorage`: surviving a reload is a
different feature, with its own questions about staleness and about
someone else's draft sitting in a shared browser.

The rule of the house: a comment composer uses `useDraft`, never
`useState("")` - anything inside topic-tabs can be unmounted under it.
