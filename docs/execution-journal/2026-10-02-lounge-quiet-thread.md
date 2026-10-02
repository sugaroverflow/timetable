# 2026-10-02 — The Lounge's quiet thread (option A, nesting kept)

## The ask

Ed chose option "A · Quiet thread" from the Lounge mockups for the
{host} Lounge's look, with one change: **keep the nesting**. It applies to
the Lounge only — topic comment threads, the comment teaser, the queue
and the sessions tab must look and behave exactly as before.

## What changed for a reader

- **The opening post leads**: 36px avatar, a 15px semibold name followed
  by the role and time as plain muted text ("Faculty · 9h"), a 15px body
  (~1.55 line height) still in the collapsible Markdown body. No bubble,
  no role pill.
- **Replies are quieter**: 24px avatar, 13px name, muted "8h · edited",
  14px body (1.5). The role stays, as muted text ("Faculty · 8h"). The
  time is still the permalink; 📌, hidden and deleted still show.
- **One action row instead of three**: reaction chips + add-reaction,
  "Reply", and a ⋯ menu (Base UI `Menu`, "More actions") holding
  whichever of Edit / Delete / Hide / Pin the viewer could already use.
  Always visible on the opening post. On replies, on devices with hover,
  the tools float as a small toolbar at the reply's top-right, shown on
  hover and `:focus-within` (opacity, so Tab still reaches them; targets
  28px). Reaction chips on a reply stay under its text. On touch the
  replies carry the same row inline.
- **Nesting kept**: replies nest as deep as before, the ordinary
  reply-indent rule per level; the first level sits under the opening
  post's text column below a top rule and a muted "n replies" count.
- **One reply box per conversation**: no chain-tail composers in the
  Lounge. ONE slim pill "Reply…" box with the viewer's 24px avatar ends
  each conversation and replies to the opening post. "Reply" on a reply
  opens the existing inline box under it (that is how nested replies
  are made); "Reply" on the opening post focuses the foot box.
- **Header**: a muted "Hosts and admins only" line under the title, in
  the forum's own labels (Newspeak: "Faculty and admins only" — the same
  `pluralLabel` wording the Forum Settings switch uses), and the desktop
  round "+" became a "+ New conversation" pill. The phone FAB and the
  full-screen composer sheet are unchanged.
- Cards: 20px 24px padding (16px under 640px).

## Mechanism

All through the comment-thread-adapter — never a copy of CommentList:

- `variant: "quiet"` — `CommentList` renders `QuietCommentItem` /
  `QuietMessage` (no bubble background: the `.c-bubble` class stays so
  the `:target` ring and the hidden fade still apply) and `CommentActions`
  renders `QuietActions` (the one row + ⋯ `MoreMenu`). Topic threads go
  through `BubbleCommentItem` / `ActionWords`, which are today's code,
  moved but not changed.
- `footComposer: true` — `ChainBlock` renders no chain tails; at the root
  it renders `FootBlock` ("n replies", the replies, and a
  `ChainTailComposer foot`: same component, same `draftKey.chain(root)`
  draft, same `focusIds` deep-link handling, styled as the pill).
- `renderFooter(comment, part)` — the Lounge splits its reacts into
  `LoungeReactionChips` (under the text) and `LoungeReactionAdd` (in the
  tools).
- The foot box keeps #364's @mention picker (`ForumMentionTextarea`,
  limited to the adapter's `mentionRoles`).
- `shortRelativeTime` ("9h", "2d") in `lib/relativeTime.ts` for the quiet
  name row.
- CSS is scoped under `.lounge-conversation` (tokens only).

## Deep links

Digest "Reply →" links and the notifications pane's reply links are
`/f/<slug>/lounge?c=<root>&reply=<id>#comment-<id>`. In the quiet thread:
`?reply=<opening post>` focuses the foot box; `?reply=<a reply>` opens
that reply's inline box, focused (`ReplyDeepLink` in `CommentActions`);
a target with no Reply of its own (a tombstone, or past the
reply-depth-guard) focuses the foot box. `?c=` alone and timestamp
permalinks (`#comment-<id>`) are untouched.

## Tests

`apps/web/src/components/CommentList.test.tsx` (jsdom): a topic thread
still ends both chains in chain-tail composers and keeps its action
words; a Lounge thread renders exactly one foot composer and no chain
tails, keeps the nesting, moves Edit/Delete behind ⋯, opens the inline
box from Reply, focuses the foot from the opening post's Reply, and
honours both `?reply=` cases. `relativeTime.test.ts` covers
`shortRelativeTime`.

## Not verified

No Clerk keys in the build sandbox, so the real Lounge page couldn't be
signed into. The look was checked by rendering `LoungeRoom` with fixture
data in jsdom and screenshotting that markup with the app's
`tokens.css` + `globals.css` in headless Chromium (light/dark, 900px with
a hovered reply, 390px touch).
