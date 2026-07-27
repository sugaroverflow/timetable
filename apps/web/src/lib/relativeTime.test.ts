import { describe, expect, it } from "vitest";

import { relativeTime } from "./relativeTime";

const NOW = Date.parse("2026-07-27T12:00:00Z");

describe("relativeTime", () => {
  it("reads 'just now' under a minute", () => {
    expect(relativeTime("2026-07-27T11:59:30Z", NOW)).toBe("just now");
  });

  it("counts minutes", () => {
    expect(relativeTime("2026-07-27T11:55:00Z", NOW)).toBe("5 minutes ago");
  });

  it("counts hours", () => {
    expect(relativeTime("2026-07-27T09:00:00Z", NOW)).toBe("3 hours ago");
  });

  it("uses friendly names when the locale has them", () => {
    expect(relativeTime("2026-07-26T12:00:00Z", NOW)).toBe("yesterday");
  });

  it("counts days", () => {
    expect(relativeTime("2026-07-24T12:00:00Z", NOW)).toBe("3 days ago");
  });

  it("counts weeks", () => {
    expect(relativeTime("2026-07-13T12:00:00Z", NOW)).toBe("2 weeks ago");
  });

  it("counts months", () => {
    expect(relativeTime("2026-05-27T12:00:00Z", NOW)).toBe("2 months ago");
  });

  it("returns empty for unparseable input", () => {
    expect(relativeTime("not-a-date", NOW)).toBe("");
  });
});
