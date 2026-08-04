import { describe, expect, it } from "vitest";

import { isDigestEnabled, isHostCommentsEnabled } from "./settings";

describe("isDigestEnabled", () => {
  it("is off for empty settings", () => {
    expect(isDigestEnabled({})).toBe(false);
  });

  it("follows an explicit digestEnabled", () => {
    expect(isDigestEnabled({ digestEnabled: true })).toBe(true);
    expect(isDigestEnabled({ digestEnabled: false })).toBe(false);
  });

  it("treats any legacy per-section flag as opted in", () => {
    expect(isDigestEnabled({ digestNewTopics: true })).toBe(true);
    expect(isDigestEnabled({ digestReplies: true })).toBe(true);
    expect(isDigestEnabled({ digestActivity: true })).toBe(true);
    expect(
      isDigestEnabled({ digestNewTopics: false, digestReplies: false }),
    ).toBe(false);
  });

  it("lets an explicit opt-out beat legacy flags", () => {
    expect(isDigestEnabled({ digestEnabled: false, digestReplies: true })).toBe(
      false,
    );
  });
});

describe("isHostCommentsEnabled", () => {
  it("defaults ON — the host-only thread predates the option", () => {
    expect(isHostCommentsEnabled({})).toBe(true);
    expect(isHostCommentsEnabled({ hostComments: {} })).toBe(true);
  });

  it("follows an explicit flag", () => {
    expect(isHostCommentsEnabled({ hostComments: { enabled: true } })).toBe(
      true,
    );
    expect(isHostCommentsEnabled({ hostComments: { enabled: false } })).toBe(
      false,
    );
  });
});
