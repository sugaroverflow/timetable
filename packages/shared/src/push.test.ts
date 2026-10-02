import { describe, expect, it } from "vitest";
import { pushTopicCandidates } from "./push";
const since = new Date("2026-09-30T10:00:00Z");
const now = new Date("2026-09-30T11:00:00Z");
const comment = {
  topicId: "topic",
  visibility: "public",
  createdAt: new Date("2026-09-30T10:30:00Z"),
  kind: "reply",
};
describe("push event selection", () => {
  it("includes a new public-thread reply", () => {
    expect(pushTopicCandidates([comment], since, now, true)).toEqual(["topic"]);
  });
  it("excludes host-only, drafting, and Lounge activity", () => {
    expect(
      pushTopicCandidates(
        [
          { ...comment, visibility: "host_only" },
          { ...comment, visibility: "admin_only" },
          {
            ...comment,
            visibility: "lounge",
            kind: "lounge_reply",
            topicId: "",
          },
          {
            ...comment,
            visibility: "lounge",
            kind: "lounge_mention",
            topicId: "",
          },
        ],
        since,
        now,
        true,
      ),
    ).toEqual([]);
  });
  it("does not replay pre-opt-in/seen events or advance over future events", () => {
    expect(
      pushTopicCandidates(
        [
          { ...comment, createdAt: since },
          { ...comment, createdAt: new Date("2026-09-30T12:00:00Z") },
        ],
        since,
        now,
        true,
      ),
    ).toEqual([]);
  });
  it("excludes session events when the calendar is disabled", () => {
    expect(
      pushTopicCandidates(
        [{ ...comment, kind: "session_confirmed" }],
        since,
        now,
        false,
      ),
    ).toEqual([]);
  });
});
