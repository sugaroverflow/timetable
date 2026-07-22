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
 * Map of electorId -> total number of hearts they gave on published topics.
 * This is the shared denominator for every normalisation below.
 */
export function computeElectorHeartCounts(
  hearts: readonly HeartRef[],
  publishedTopicIds: ReadonlySet<string>,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const heart of hearts) {
    if (!publishedTopicIds.has(heart.topicId)) continue;
    counts.set(heart.electorId, (counts.get(heart.electorId) ?? 0) + 1);
  }
  return counts;
}

/**
 * Map of electorId -> per-heart weight (1 / total), considering only hearts on
 * published topics. Electors with no hearts are simply absent (weight 0).
 */
export function computeElectorWeights(
  hearts: readonly HeartRef[],
  publishedTopicIds: ReadonlySet<string>,
): Map<string, number> {
  const counts = computeElectorHeartCounts(hearts, publishedTopicIds);
  const weights = new Map<string, number>();
  for (const [electorId, count] of counts) {
    weights.set(electorId, count > 0 ? 1 / count : 0);
  }
  return weights;
}

/**
 * The four ranking normalisations for a topic (product feedback round 1).
 * All are computed from the per-elector total-heart counts.
 *
 *   raw      Σ❤️            no normalisation, every ❤️ equal            (L∞)
 *   l2       Σ 1/√total      enthusiasm discounted by √ of an elector's
 *                            total ❤️s                                  (L2)
 *   l1       Σ 1/total       each elector has one unit of enthusiasm     (L1)
 *   devotion (Σ 1/total)/Σ❤️ average devotion — the mean share of their
 *                            ❤️s that this topic's supporters gave it   (L1/L∞)
 */
export type NormMode = "raw" | "l2" | "l1" | "devotion";

export type TopicNormScores = {
  raw: number;
  l2: number;
  l1: number;
  devotion: number;
};

export function topicNormScores(
  topicHearts: readonly HeartRef[],
  electorHeartCounts: ReadonlyMap<string, number>,
): TopicNormScores {
  const raw = topicHearts.length;
  let l1 = 0;
  let l2 = 0;
  for (const heart of topicHearts) {
    const total = electorHeartCounts.get(heart.electorId) ?? 0;
    if (total > 0) {
      l1 += 1 / total;
      l2 += 1 / Math.sqrt(total);
    }
  }
  return { raw, l2, l1, devotion: raw > 0 ? l1 / raw : 0 };
}
