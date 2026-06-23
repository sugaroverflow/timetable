/**
 * Weighted-heart math, ported verbatim from the prototype's domain logic:
 *
 *   weight(elector)      = 1 / (number of PUBLISHED topics they hearted)
 *   weightedScore(topic) = sum of weight(elector) over electors who hearted it
 *
 * Each elector therefore distributes a total influence of 1 across all the
 * topics they heart, so hearting fewer topics makes each heart count for more.
 */

export type HeartRef = {
  topicId: string;
  electorId: string;
};

/**
 * Map of electorId -> per-heart weight, considering only hearts on published
 * topics. Electors with no hearts are simply absent from the map (weight 0).
 */
export function computeElectorWeights(
  hearts: readonly HeartRef[],
  publishedTopicIds: ReadonlySet<string>,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const heart of hearts) {
    if (!publishedTopicIds.has(heart.topicId)) continue;
    counts.set(heart.electorId, (counts.get(heart.electorId) ?? 0) + 1);
  }

  const weights = new Map<string, number>();
  for (const [electorId, count] of counts) {
    weights.set(electorId, count > 0 ? 1 / count : 0);
  }
  return weights;
}

/** Total weighted score for a topic given precomputed elector weights. */
export function topicWeightedScore(
  topicHearts: readonly HeartRef[],
  weights: ReadonlyMap<string, number>,
): number {
  return topicHearts.reduce(
    (sum, heart) => sum + (weights.get(heart.electorId) ?? 0),
    0,
  );
}

/** Per-elector contribution to a topic, for the host-only breakdown panel. */
export type WeightedHeart = {
  electorId: string;
  weight: number;
};

export function topicWeightedBreakdown(
  topicHearts: readonly HeartRef[],
  weights: ReadonlyMap<string, number>,
): WeightedHeart[] {
  return topicHearts
    .map((heart) => ({
      electorId: heart.electorId,
      weight: weights.get(heart.electorId) ?? 0,
    }))
    .sort((a, b) => b.weight - a.weight);
}
