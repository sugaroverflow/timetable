import { describe, expect, it } from "vitest";

import {
  computeElectorHeartCounts,
  computeElectorWeights,
  topicNormScores,
  type HeartRef,
} from "./hearts";

describe("computeElectorWeights", () => {
  it("weights each elector as 1 / (# published topics hearted)", () => {
    const hearts: HeartRef[] = [
      { topicId: "a", electorId: "nick" },
      { topicId: "b", electorId: "nick" },
      { topicId: "a", electorId: "emily" },
    ];
    const published = new Set(["a", "b"]);

    const weights = computeElectorWeights(hearts, published);

    expect(weights.get("nick")).toBeCloseTo(0.5); // hearted 2 topics
    expect(weights.get("emily")).toBeCloseTo(1); // hearted 1 topic
  });

  it("ignores hearts on unpublished topics", () => {
    const hearts: HeartRef[] = [
      { topicId: "a", electorId: "nick" },
      { topicId: "draft", electorId: "nick" },
    ];
    const published = new Set(["a"]);

    const weights = computeElectorWeights(hearts, published);

    expect(weights.get("nick")).toBeCloseTo(1); // only the published one counts
  });
});

describe("computeElectorHeartCounts", () => {
  it("counts each elector's total hearts on published topics", () => {
    const hearts: HeartRef[] = [
      { topicId: "a", electorId: "nick" },
      { topicId: "b", electorId: "nick" },
      { topicId: "a", electorId: "emily" },
      { topicId: "draft", electorId: "emily" },
    ];
    const published = new Set(["a", "b"]);

    const counts = computeElectorHeartCounts(hearts, published);

    expect(counts.get("nick")).toBe(2);
    expect(counts.get("emily")).toBe(1); // the draft heart is ignored
  });
});

describe("topicNormScores", () => {
  // nick hearts a,b (total 2); emily hearts a (total 1).
  const hearts: HeartRef[] = [
    { topicId: "a", electorId: "nick" },
    { topicId: "b", electorId: "nick" },
    { topicId: "a", electorId: "emily" },
  ];
  const published = new Set(["a", "b"]);
  const counts = computeElectorHeartCounts(hearts, published);

  it("computes all four normalisations for a topic", () => {
    const a = topicNormScores(
      hearts.filter((h) => h.topicId === "a"),
      counts,
    );
    expect(a.raw).toBe(2); // Σ❤️ (L∞)
    expect(a.l1).toBeCloseTo(1.5); // 1/2 + 1/1 — matches weightedScore
    expect(a.l2).toBeCloseTo(1 / Math.sqrt(2) + 1); // ≈ 1.7071
    expect(a.devotion).toBeCloseTo(0.75); // l1 / raw
  });

  it("l1 equals the legacy weightedScore (sum of 1/n per elector)", () => {
    const topicAHearts = hearts.filter((h) => h.topicId === "a");
    // nick hearted 2 published topics (1/2) + emily hearted 1 (1/1) = 1.5
    expect(topicNormScores(topicAHearts, counts).l1).toBeCloseTo(1.5);
  });

  it("returns zero devotion for a topic with no hearts", () => {
    expect(topicNormScores([], counts)).toEqual({
      raw: 0,
      l2: 0,
      l1: 0,
      devotion: 0,
    });
  });
});
