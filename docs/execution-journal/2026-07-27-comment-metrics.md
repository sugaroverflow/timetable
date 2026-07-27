# 2026-07-27 - 💬 comment metrics on the Analysis leaderboard

## What happened

Product discussion: the weighted-❤️ norms could apply to comments too.
Agreed and shipped a first version, **Analysis-only** (deliberately not
a feed sort — sorting the public feed by discussion volume rewards
controversy and feeds back on itself). The topics analysis table's norm
switcher now has two optgroups: the four ❤️ norms and five 💬 norms.

## The math (`packages/shared/src/commentScores.ts`)

Comments differ from hearts in that one person can comment on a topic
many times, so everything aggregates per-(user, topic) tallies first:

- `Σ💬` total — every counted comment.
- `#💬` distinct commenters — each person once (the `heartCount`
  analog, and the bluntest within-topic damping).
- `Σ💬/√💬` L2 — discounted by √ of the commenter's total.
- `Σ💬/💬` L1 attention share — each commenter distributes one unit
  across the topics they comment on; a nice property is that one
  person's contribution to a topic is capped at 1, however long the
  thread.
- devotion — L1 / commenters, the mean attention share.

## Which comments count

Elector-authored public comments on published topics, **never the
topic's own host** (electors drive metrics — per Ed), non-hidden,
inside the same activity window as ❤️ counting (the hearts cutoff).
Tallies are always forum-wide so the host filter can't shrink a
commenter's denominator. Loader: `loadCommentTallies` in
`packages/core/src/analytics.ts`, one grouped query.

## UI notes

Same notation style as the ❤️ norms with 💬 in the symbols; the
leaderboard title's "sorted by" clause switches to the 💬 total while
a comment norm is active. Prune candidates were deliberately kept —
Ed wants to see all of them live before cutting.
