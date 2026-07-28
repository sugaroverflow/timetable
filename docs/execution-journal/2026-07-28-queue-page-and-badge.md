# Topic Queue gets its own page + sidebar badge

**Date:** 2026-07-28

Queue QA round 3 (Ed): the queue was never really a sort — it's an
activity. It moves out of the All Topics sort menu into its own sidebar
page.

- **`/f/[slug]/queue`** — the queue view unchanged (big 🔁/❤️ buttons,
  folded comments, end-of-round). Old `?sort=queue` links redirect; the
  sort menu is sorts-only again.
- **Sidebar "Topic Queue"** (elector-only, under All Topics) with a red
  `nav-badge` showing the **never-seen count** — the same number as the
  Analysis "Queue" column: published topics the elector has never seen nor
  ❤️'d. Ed's call: always red, disappears at zero. Because it's ever-seen
  (not round-relative), finishing your first round zeroes it for good and
  round restarts never revive it — red genuinely means "topics you've
  never laid eyes on". `TopicQueueState` gains `neverSeenCount`.
- **NavLink is query-aware now**: an href carrying search params
  (❤️ Topics at `/topics?hearted=me`) is active only when they match, and
  All Topics declares `whenAbsent={["hearted"]}` — fixes the long-standing
  oddity where clicking ❤️ Topics highlighted All Topics.
