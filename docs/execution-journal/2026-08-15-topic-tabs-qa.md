# 2026-08-15 — topic-tabs QA round 1 + workbench company line

Ed's first QA pass over the topic-tabs strip (shipped 2026-08-14 in #279 /
#280) and the topic-workbench. Four of his five notes are here; the fifth
(the 💙 actions row inside the {host}-only tab duplicating the card's own
actions row) is a design question waiting on his answer, so nothing about
host hearts moved.

## The strip stays on one line

Wrapping tabs read as a pile of buttons — on a phone the strip regularly
took two rows and the shared baseline that says "these are tabs" was gone.
`.card-tabs` is now `flex-wrap: nowrap` with `overflow-x: auto`, i.e. the
standard scrollable tab strip. Two details worth keeping:

- The bottom rule moved from `border-bottom` to
  `box-shadow: inset 0 -1px 0`. A scroll container clips its overflow on
  BOTH axes (a `visible` axis computes to `auto` when the other is
  `auto`), so the old trick of hanging the selected tab's 2px underline
  1px past the content box would have clipped the underline away. The
  inset line paints on the padding box and the tab's own bottom border
  covers it, so no negative margin is needed.
- Scrollability is hinted with the `local`/`scroll` background trick: two
  `--card`-coloured cover gradients attached `local` sit over two shadow
  gradients attached `scroll`, so the shadow only shows when there is
  really something off the edge. Nothing to measure in JS.

Tab padding tightens to 8px under 480px, which is usually enough to fit
three tabs without scrolling at all.

## No doubled divider inside a tab

`.comment-section` and `.host-thread` both carry their own top rule — fine
when a card renders one section bare (the pre-tabs presentation), but
inside a tab panel it drew a second horizontal line a few pixels under the
strip's own. `.card-tab-panel` now suppresses the nested rule and its
padding. Untabbed cards are untouched.

## 📚, not 🔒

The {host}-only tab's icon is lucide `Library` instead of `Lock` (Ed): the
thread is the faculty common room, not a locked box. Lucide's shelf of
books is the line-art of the emoji he asked for, so the strip keeps one
icon family rather than mixing an emoji into three line icons.

## The workbench shows the company

`topicSlotFit` rows gained `others` — every OTHER session already on that
slot as `{id, label, status}`, labelled "Ann: Quantum ethics", an admin
custom title, or "Hannah — Office hours" (the forum's office-hours label,
resolved server-side). They render as a quiet muted line under the
datetime, `✎` or `✓` by status, using the calendar page's session-line
indent.

This is context, not conflict: pencils are location-less time-intents and
never contend (migration 0037), so another pencil here just means company.
A `✓` is the sharper signal — confirmed sessions ARE exclusive per
(slot, location) (migration 0038), so the room race on that slot has
already started.

Nothing else leaks: no counts, no availability, no per-user data about
other topics' audiences — only what the calendar page already shows any
member.
