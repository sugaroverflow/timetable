# 2026-08-06 — Calendar QA: wash corners, claim preview, chat alignment

Four items from Ed's live QA of the row-wash calendar on dev, plus a
type rationalisation pass:

- **Wash bottom corners.** With a row folded open the washes cover only
  `.cal-row-head` and stop above the discussion — but the rounding lived
  on `.cal-row`'s overflow clip, so the wash's bottom edge was square
  mid-row. The head now rounds and clips its own corners (radius 8px +
  overflow hidden; identical rendering when closed).
- **Claim preview replaces the sentence.** The composer's "Posting
  attaches **Topic** with its current 🟢🟡🔴 counts." hint is now the
  actual attachment, rendered under the composer as it will appear on the
  posted comment: a shared `ClaimChip` (📌 title · 🟢 n 🟡 n 🔴 n) used
  by both the posted claim and the preview. The preview's counts are
  `slot.counts` — the lens audience drives the calendar query, which is
  the same hearters-of-this-topic computation the server snapshots on
  post, so the preview shows the numbers that will freeze.
- **Slot chat = topic chat.** `SlotDiscussion`'s `CommentRow` had its own
  parallel markup (`.hc`/`.hc-name`-above-bubble/`.hc-bubble` with
  border + card background). It now uses the exact structure and classes
  of `CommentList` — PersonChip-wrapped avatar, `.comment`/`.comment-main`,
  `.c-bubble` with the name/role-pill/(edited) row inside, `.c-text` —
  and the thread wrapper gains `thread-stack` for the standard 10px
  rhythm. Editing swaps inside the bubble like topic comments. The
  orphaned `.hc*` rules are deleted; `.cal-comment-hidden` fades
  `.c-bubble` instead.
- **Wrapped session text breathing room.** `.cal-row-line` had zero
  vertical padding (the 52px min-height centred single lines), so wrapped
  session titles sat flush against the row edges. Now 8px vertical
  padding — invisible on single-line rows (still centred in 52px), 8px of
  air once the text wraps. The mobile block's identical padding override
  became redundant and is gone.

## Type rationalisation (same session)

Ed: the serif session text predates the row-wash design — "maybe we
don't need that anymore". Audit found a patchwork: the when-text had no
size rule at all (16px browser default) beside a 15px serif semibold
session line whose `<strong>` title rendered bold-on-bold, plus stray
hardcoded sizes. Now:

- **One row voice**: `.cal-row-line` sets `--text-md` (15px) sans for
  the whole line; emphasis is weight only — bold date, bold topic title.
  `.cal-session-line` (serif/15px/semibold) is deleted from CSS and
  markup; the wash, the bold title, and the status pill do the
  distinguishing. Serif stays the heading voice (card/section titles).
- **Metadata tier unchanged** — already consistent at `--text-xs`:
  location, 💬 count, legend, month headings, claim chip, pills.
- **Tokens for the strays**: `.avseg-compact button` 12px →
  `var(--text-xs)`; the URL input's inline 13px dropped (global input
  base 14px applies); the admin label's inline 11px → `var(--text-2xs)`.
