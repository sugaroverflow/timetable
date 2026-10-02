# 2026-10-02 — Ctrl/⌘+Enter posts a comment (#361)

## The ask

King-Mob's #361: "On gmail (and on github…) you can use ctrl+enter to
post. I would like that on topics so that i don't have to click the
button." Ed picked it on 2026-10-02.

## What we built

**submit-shortcut** — `apps/web/src/lib/submitShortcut.ts`, one rule for
every composer:

- `isSubmitShortcut(e)` — Enter with Ctrl or ⌘, no Shift/Alt, and never
  during an IME composition (`isComposing`, on the event or React's
  `nativeEvent`, or keyCode 229). Pure, unit-tested.
- `submitFormFrom(el)` — presses the surrounding form's send button with
  `form.requestSubmit(button)`, so the shortcut runs the SAME submit
  handler a click does: the same empty-text check, the same mutation,
  draft clearing and toasts. It does nothing while that button is
  disabled (every send button is `disabled={busy}`, so an in-flight post
  is never doubled) or when the form has more than one submit button
  (no single obvious action to press).
- `handleSubmitShortcut(e)` — the keydown glue: on the shortcut, swallow
  the key and submit.

**Where it's wired:**

1. **`GrowingTextarea`** — every plain-text comment composer is this box
   inside a form with one send button, so the handler lives here once
   and covers them all: top-composer (`CommentComposer`, all three
   visibilities), chain-tail-composer (and the Lounge's foot "Reply…"
   box), the inline Reply box (`CommentActions`), inline comment edit
   (`CommentEditForm` — Ctrl+Enter saves), and the calendar's slot chat
   (`SlotDiscussion` — post and edit). A caller's own `onKeyDown` runs
   first and can claim the key with `preventDefault`.
2. **`MentionTextarea`** — while the @mention list is open the picker
   keeps plain Enter/Tab, but Ctrl/⌘+Enter now closes the list and falls
   through to post. The text goes as typed: a half-typed `@ad` posts as
   `@ad`, never auto-completed to a person (the server still resolves an
   exact hand-typed handle).
3. **`RichTextEditor`** gained an opt-in `submitOnShortcut`, passed by
   the forms with one obvious submit: new topic (`CreateTopicForm`), topic
   edit (`TopicEditForm`), and the Lounge's opening post — start
   (`LoungeComposer`) and edit (`LoungeOpeningEditor`). It's a ProseMirror
   view-level `handleKeyDown`, which runs before extension keymaps, so it
   outranks StarterKit's HardBreak `Mod-Enter`; Shift+Enter still inserts
   a line break. The draft-recovery forms discard their stored draft only
   in `onSuccess`, so the shortcut behaves exactly as clicking the button.
   Not wired: the profile editors (`ProfileForm`, `MemberRolesEditor`) —
   not composers.
4. **`aria-keyshortcuts="Control+Enter Meta+Enter"`** on every send
   button the shortcut presses. No visible text changed.

Plain Enter is untouched everywhere: a new line, or in the Topic Queue
(`submitOnEnter`) posting as before. Ctrl/⌘+Enter also posts there —
`enterToPost` ignores modified Enters, so the shared handler takes it,
and the post's blur-on-success still hands the arrows back.

## Tests

- `apps/web/src/lib/submitShortcut.test.ts` (node): Ctrl+Enter and
  ⌘+Enter post; plain, Shift, Ctrl+Shift and ⌘+Alt+Enter don't; other
  keys don't; an IME composition never does.
- `apps/web/src/components/SubmitShortcut.test.tsx` (jsdom, the
  QueueControls/CommentList pattern) on a topic thread's Reply box:
  Ctrl+Enter sends the reply mutation and plain/Shift+Enter don't; ⌘+Enter
  too; blank text sends nothing; a second Ctrl+Enter while the first is
  in flight sends nothing; an IME Ctrl+Enter sends nothing; with the
  @mention list open Ctrl+Enter posts "hi @ad" as typed and plain Enter
  still picks "@ada ". Plus `submitFormFrom`'s three rules (one button,
  disabled, several).

## Worth knowing

- The comment-draft-store outlives a composer: a test that leaves text in
  a Reply box makes the next test's box open on mount. The test clears
  the draft in `beforeEach`.
- Discoverability is only `aria-keyshortcuts`; a visible hint (tooltip
  "Post (Ctrl+Enter)") was left for Ed.
