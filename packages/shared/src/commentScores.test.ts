import { describe, expect, it } from "vitest";

import {
  computeCommenterTotals,
  topicCommentScores,
  type CommentTally,
} from "./commentScores";

// alice: 4 💬 total (3 on A, 1 on B) · bob: 1 💬 (A) · cara: 4 💬 (all on B)
const TALLIES: CommentTally[] = [
  { topicId: "A", userId: "alice", count: 3 },
  { topicId: "B", userId: "alice", count: 1 },
  { topicId: "A", userId: "bob", count: 1 },
  { topicId: "B", userId: "cara", count: 4 },
];

describe("computeCommenterTotals", () => {
  it("sums per-user counts across topics", () => {
    const totals = computeCommenterTotals(TALLIES);
    expect(totals.get("alice")).toBe(4);
    expect(totals.get("bob")).toBe(1);
    expect(totals.get("cara")).toBe(4);
  });
});

describe("topicCommentScores", () => {
  const scores = topicCommentScores(TALLIES);

  it("raw total counts every comment", () => {
    expect(scores.get("A")?.total).toBe(4);
    expect(scores.get("B")?.total).toBe(5);
  });

  it("commenters counts each person once", () => {
    expect(scores.get("A")?.commenters).toBe(2);
    expect(scores.get("B")?.commenters).toBe(2);
  });

  it("l1 gives each user one unit of attention, capped at 1", () => {
    // A: alice 3/4 + bob 1/1 = 1.75 · B: alice 1/4 + cara 4/4 = 1.25
    expect(scores.get("A")?.l1).toBeCloseTo(1.75);
    expect(scores.get("B")?.l1).toBeCloseTo(1.25);
    // cara's 4 comments on one topic still contribute exactly 1.
  });

  it("l2 discounts by the sqrt of the user's total", () => {
    // A: 3/2 + 1/1 = 2.5 · B: 1/2 + 4/2 = 2.5
    expect(scores.get("A")?.l2).toBeCloseTo(2.5);
    expect(scores.get("B")?.l2).toBeCloseTo(2.5);
  });

  it("devotion is the mean attention share of the topic's commenters", () => {
    expect(scores.get("A")?.devotion).toBeCloseTo(1.75 / 2);
    expect(scores.get("B")?.devotion).toBeCloseTo(1.25 / 2);
  });

  it("topics with no counted comments are simply absent", () => {
    expect(scores.get("C")).toBeUndefined();
    expect(topicCommentScores([]).size).toBe(0);
  });
});
