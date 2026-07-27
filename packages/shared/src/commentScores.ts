/**
 * Weighted-comment math — the 💬 analog of hearts.ts (QA 2026-07-27).
 *
 * Unlike hearts, one person can comment on the same topic many times, so
 * everything aggregates per-(user, topic) tallies first. Which comments
 * count is decided upstream (core): elector-authored public comments only —
 * electors drive metrics — and never the topic's own host.
 *
 *   total      Σ💬                every counted comment, raw            (L∞)
 *   commenters distinct people    each commenter counts once
 *   l2         Σ n/√total         discounted by √ of the commenter's
 *                                 total 💬s                             (L2)
 *   l1         Σ n/total          each commenter has one unit of
 *                                 attention split across topics — a
 *                                 single person can never contribute
 *                                 more than 1                           (L1)
 *   devotion   l1 / commenters    the mean share of their 💬s that this
 *                                 topic's commenters gave it
 */

export type CommentTally = {
  topicId: string;
  userId: string;
  /** Counted comments by this user on this topic (≥ 1). One tally per
   * (user, topic) pair. */
  count: number;
};

export type TopicCommentScores = {
  total: number;
  commenters: number;
  l2: number;
  l1: number;
  devotion: number;
};

/** Map of userId -> total counted comments — the shared denominator. */
export function computeCommenterTotals(
  tallies: readonly CommentTally[],
): Map<string, number> {
  const totals = new Map<string, number>();
  for (const t of tallies) {
    totals.set(t.userId, (totals.get(t.userId) ?? 0) + t.count);
  }
  return totals;
}

/** Per-topic 💬 scores over the full tally set (empty topics are absent). */
export function topicCommentScores(
  tallies: readonly CommentTally[],
): Map<string, TopicCommentScores> {
  const totals = computeCommenterTotals(tallies);
  const byTopic = new Map<string, TopicCommentScores>();
  for (const t of tallies) {
    const scores = byTopic.get(t.topicId) ?? {
      total: 0,
      commenters: 0,
      l2: 0,
      l1: 0,
      devotion: 0,
    };
    scores.total += t.count;
    scores.commenters += 1;
    const userTotal = totals.get(t.userId) ?? 0;
    if (userTotal > 0) {
      scores.l1 += t.count / userTotal;
      scores.l2 += t.count / Math.sqrt(userTotal);
    }
    byTopic.set(t.topicId, scores);
  }
  for (const scores of byTopic.values()) {
    scores.devotion = scores.commenters > 0 ? scores.l1 / scores.commenters : 0;
  }
  return byTopic;
}
