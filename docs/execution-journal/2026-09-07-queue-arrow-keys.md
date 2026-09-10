# Arrow keys on the Topic Queue (2026-09-07)

The ask: work the four arrow directions into the existing queue UI —
**left back, right next, up ❤️, down comment** — so a round can be worked
through without the mouse.

The mapping was already half true. queue-back put Back on the left and
Next on the right in August, as buttons; this binds the keys to them and
adds the two the bar didn't have: ↑ toggles the ❤️ switch, ↓ drops into
the comment box.

## Nothing new from the keyboard

Every arrow does exactly what the button under it does, including the
queue-back rules — ← is the same URL step (`?back=n`, a pure read that
un-reviews nothing), → is the Next that marks seen and advances, or the
forward step while looking back. So there is no second code path to keep
in sync, and no gesture that only exists for keyboard users.

↑ is the ❤️ switch, which still saves without advancing: deciding and
moving on stay separate, as they have since the v2 switcher.

## ↓ and the composer

↓ opens the card's discussion (`requestOpen`, the channel the 💬 button
uses) and puts the caret in the public composer. The box isn't reliably in
the DOM at that moment — `followCommentsOpen` may be switching the
topic-tabs strip back to Comments, and that pane renders a frame later —
so the focus attempt retries across a few animation frames rather than
looking once.

In the box, **Enter posts**, Shift+Enter starts a line, Escape blurs and
hands the arrows back to the queue. That is `CommentComposer`'s new
`submitOnEnter`, and the queue is the only surface that passes it: on a
feed card, where the composer is one of twenty and nothing brought you
there deliberately, Enter-to-post costs you a half-written paragraph. The
mention picker still sees the key first, so Enter picks a handle while the
menu is open. The placeholder says "Enter posts" — the one bit of copy
here, because that behaviour is invisible and destructive when it
surprises you.

## One listener, dispatched through a ref

`QueueControls` binds a single window `keydown` listener per mount and
calls the current handler through a ref. This matters: `router.refresh()`
reconciles this client component IN PLACE (the same trap the per-topic
state reset already documents), so a listener closed over `topicId` keeps
hearting the topic you had two cards ago.

The mapping itself is pure — `queueKeyAction` and `isTypingTarget` in
`lib/queueKeys.ts`, unit-tested. The cases worth testing are the ones
where the queue must NOT act: any modifier belongs to the browser (⌘←
is history back), and a keystroke inside an input, textarea or
contenteditable belongs to whatever is being typed in, the composer ↓ just
opened above all.

## What it costs

↑/↓ `preventDefault`, so arrow-key page scrolling is gone on the queue
page — a long topic body scrolls with the wheel, space, or PageUp/PageDown
instead. That is the trade the mapping asks for, and the queue is one card
at a time by design.

The legend under the bar (`← back · ↑ ❤️ · ↓ comment · → next`) is
aria-hidden; the buttons carry the same shortcuts in `aria-keyshortcuts`,
so assistive tech is told once, not twice. The ❤️ hint is dropped for
members without the gesture.

Not done: the end-of-round screen has no keys. `QueueControls` isn't
rendered there, and "Look back at the last topic" is already a link.

## How it was checked

**Not in a browser.** Signing in locally needs Clerk development keys and
there were none to hand, and the queue is members-only, so the page could
not be opened. `apps/web` got its first jsdom component test instead:
`QueueControls.test.tsx` mounts the bar with `next/navigation`,
`clientGql` and the toast mocked, fires each arrow at `window`, and asserts
what came out — `?back=1` for ←, `queueMarkSeen` + refresh for →,
`heartTopic` for ↑, focus landing on `[data-topic-composer]` for ↓, and
nothing at all for a modified arrow or one typed into the composer.

The suite has teeth: with the `window.addEventListener` line removed, five
of the ten fail. (The other five are the "does nothing" cases, which is
what they are for.)

That is the first component test in the web workspace, so it brought
`jsdom` + `@testing-library/react` in as devDependencies and one line of
`vitest.config.ts`: Vite 8 transforms with Oxc, and the tsconfig's
`jsx: preserve` (which Next needs) leaves JSX untransformed, so
`oxc: { jsx: { runtime: "automatic" } }` turns it on for tests. Node stays
the default environment — a jsdom test opts in with an
`@vitest-environment jsdom` docblock, so the pure lib tests are unaffected.

Still unverified by eye: the legend's spacing under the bar, and whether ↓
reaches the composer when the strip has to switch back from another tab
(the retry across animation frames is a belt-and-braces guess at a real
render timing).

## Adopted (2026-09-10)

Matt's PR (#346) was taken as-is with two changes before merging. The
commit carried a stray `suggestLibraryComment` block — a "Civic Tech Field
Guide" lookup that pre-composed a comment on ↓ — importing
`composeLibraryComment`, `getDraft` and `setDraft` from modules this repo
doesn't have (they live on another branch of his), which is why CI's
`next build` failed. That block is removed; the arrow keys are unchanged.
And once Enter has posted, the composer now blurs itself in
`submitOnEnter` mode, so the round continues with → rather than needing an
Escape first — the placeholder keeps the @-mention hint alongside "Enter
posts".
