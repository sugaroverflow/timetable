import { describe, expect, it } from "vitest";

import {
  computeElectorWeights,
  topicWeightedBreakdown,
  topicWeightedScore,
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

describe("topicWeightedScore", () => {
  it("sums elector weights for a topic", () => {
    const hearts: HeartRef[] = [
      { topicId: "a", electorId: "nick" }, // nick hearted 2 -> 0.5
      { topicId: "b", electorId: "nick" },
      { topicId: "a", electorId: "emily" }, // emily hearted 1 -> 1
    ];
    const published = new Set(["a", "b"]);
    const weights = computeElectorWeights(hearts, published);

    const topicAHearts = hearts.filter((h) => h.topicId === "a");
    expect(topicWeightedScore(topicAHearts, weights)).toBeCloseTo(1.5);
  });
});

describe("topicWeightedBreakdown", () => {
  it("returns per-elector weights sorted descending", () => {
    const hearts: HeartRef[] = [
      { topicId: "a", electorId: "nick" },
      { topicId: "b", electorId: "nick" },
      { topicId: "a", electorId: "emily" },
    ];
    const published = new Set(["a", "b"]);
    const weights = computeElectorWeights(hearts, published);

    const breakdown = topicWeightedBreakdown(
      hearts.filter((h) => h.topicId === "a"),
      weights,
    );

    expect(breakdown[0]).toEqual({ electorId: "emily", weight: 1 });
    expect(breakdown[1]).toEqual({ electorId: "nick", weight: 0.5 });
  });
});
