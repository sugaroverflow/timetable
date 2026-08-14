# Card-section tabs on every topic card

**Date:** 2026-08-14
**Trigger:** Ed, after QA-ing the My Topics tabs: "I love the tabs! Let's
have them on all topic cards where there are multiple activities going on
… falling back to what we have now if only one activity."

## Changes

- **`CardSectionTabs.tsx`** (new, generic): takes a `CardSection[]`
  (value, keyed icon, text, badge, pane). ≥2 sections → the horizontal
  strip; exactly 1 → the pane renders bare, i.e. the pre-tabs card;
  0 → nothing. Icons are keyed rather than ReactNode so server components
  can describe sections without crossing the client boundary.
  `followCommentsOpen` subscribes to CommentsOpenScope and snaps the strip
  back to the Comments tab whenever the actions row's 💬 button or the
  top-composer fires (render-phase state adjustment — the effect version
  trips the cascading-renders lint).
- **Feed/permalink/queue** (`TopicCard.tsx`): `buildFeedSections` —
  Comments (when the viewer can comment or comments exist; pane is the
  existing CommentSection, teaser machinery untouched) + {host}-only (for
  host/admin viewers when the forum option is on, matching the old
  TopicTail mount rule — 💙 row and composer included even when empty).
  Electors and anonymous viewers therefore see exactly the old card
  (single section → bare). The host-only thread left TopicTail.
- **My Topics** (`TopicCardTabs.tsx`): rebuilt on CardSectionTabs with
  per-section builder functions; new fallback — a fresh submitted topic
  whose only live section is the drafting thread gets the old collapsible
  AdminCommentsPanel instead of a one-tab strip.
- The collapsible `HostOnlyPanel` wrapper is now dead and was removed
  (`HostOnlyThreadBody` is the export). `AdminCommentsPanel`'s wrapper
  survives at the permalink DraftingThread and ModerationCard.
- Deliberately NOT folded into tabs this round: the permalink page's
  below-card DraftingThread (it isn't on the card), and Scheduling stays
  a My Topics-only section.

## Notes

- "Activities" naming: Ed asked for a better word; proposal pending
  ("channels" vs "sections") — glossary says "card sections" meanwhile.
