import { describe, expect, it } from "vitest";

import { redirectTargetHost } from "./canonicalHost";

const PROD = "https://topic.forum";
const DEV = "https://dev.timetable.love";

describe("redirectTargetHost", () => {
  it("redirects www and legacy domains to the deployment origin", () => {
    expect(redirectTargetHost("www.topic.forum", PROD)).toBe("topic.forum");
    expect(redirectTargetHost("timetable.love", PROD)).toBe("topic.forum");
    expect(redirectTargetHost("www.timetable.love", PROD)).toBe("topic.forum");
  });

  it("serves the canonical host in place", () => {
    expect(redirectTargetHost("topic.forum", PROD)).toBeNull();
    expect(redirectTargetHost("dev.timetable.love", DEV)).toBeNull();
  });

  it("never redirects customer custom domains", () => {
    expect(redirectTargetHost("forum.example.org", PROD)).toBeNull();
  });

  it("never redirects local hosts, and local dev never redirects at all", () => {
    expect(redirectTargetHost("localhost", PROD)).toBeNull();
    expect(redirectTargetHost("127.0.0.1", PROD)).toBeNull();
    expect(
      redirectTargetHost("timetable.love", "http://localhost:3000"),
    ).toBeNull();
  });

  it("handles empty host and malformed origin", () => {
    expect(redirectTargetHost("", PROD)).toBeNull();
    expect(redirectTargetHost("topic.forum", "not a url")).toBeNull();
  });
});
