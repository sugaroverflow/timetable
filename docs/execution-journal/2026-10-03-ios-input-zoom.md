# 2026-10-03 — iPhone: no zoom when you tap a text box

## The bug

Ed, QA on topic.forum in iPhone Safari: tapping into the Lounge's
"Reply…" box zoomed the whole page in, and he could then scroll it
sideways. iOS Safari zooms whenever it focuses a text field whose computed
font-size is under 16px. Every field in the app was under that: the global
`input, textarea, select` rule uses `--text-base` (14px), and several
surfaces go smaller still (the chain-tail-composer 13px, `.feed-search`
13px, `.feed-toolbar select` 12px, `.cal-pencil-select` 13px, the emoji
search 13px, the admin "Reassign owner…" select's inline 12px, the
rich-text editor's `.tiptap` 15px). So it was every text box on an
iPhone, not just the Lounge.

## The fix

One block at the foot of `globals.css`, "Touch: no zoom on focus":
under `@media (hover: none) and (pointer: coarse)`, every text-like
`input` (untyped, text, search, email, url, tel, number, password, date,
time, datetime-local), every `textarea`, every `select` and every
`contenteditable` (TipTap's `.ProseMirror`) computes to a new token,
`--text-field-touch` (= `--text-lg`, 16px). `!important`, so every
per-surface size loses without a specificity race — and a stylesheet
`!important` also beats the reassign select's inline style. Checkboxes,
radios, file pickers and buttons are untouched.

Why the media query and not `@supports (-webkit-touch-callout: none)`
(the iOS-only hook): it is the same "primary input is a finger" test the
hover-only blocks already use, it covers every iOS browser (all WebKit),
and Chromium can emulate it, so the check below can run. A desktop never
matches, so desktop typography is unchanged. The cost: Android phones
get 16px fields too (they never zoomed) — consistent, and arguably
easier to type in.

Two follow-ons keep the composers looking as they did:

- `.inline-form textarea` gets `line-height: 1.25` on touch — 16 × 1.25
  = 20px, the same line box as desktop's 14 × 1.4 — so GrowingTextarea's
  mount-time fit doesn't grow a resting one-line box and the send button
  stays level with it.
- The composer placeholder stays on one line, ellipsised. At 16px "Add a
  comment… (@ to mention)" wrapped on a 390px card and the empty box
  rested two lines tall (the chain-tail one already did at 13px).

Not done, deliberately: `maximum-scale=1` / `user-scalable=no` on the
viewport. That would stop the zoom by taking pinch-zoom away from
everyone.

## Checked

Headless Chromium (chromium-1234) on the real `tokens.css` +
`globals.css`, rendering a Lounge fixture (`LoungeRoom`), a topic thread
(`CommentComposer` + `CommentList`) and a fixture of every other field
shape (feed sort/search, every input type, the pencil select, the
inline-styled reassign select, the emoji search, a TipTap content node):

- iPhone context (390px, `isMobile`, `hasTouch`): 22 fields; before, all
  22 under 16px; after, none. Page width stays 390 (no sideways scroll).
  One-line heights: top-composer 40px (= send button, centred), Lounge
  "Reply…" pill 36px (unchanged), chain-tail 40px (was 56px — wrapped
  placeholder).
- Desktop at 1200px: before/after screenshots byte-identical, all
  measurements identical.
