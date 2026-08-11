import { describe, expect, it } from "vitest";

import {
  DIGEST_KIND_DEFAULTS,
  DIGEST_KINDS,
  effectiveDigestSettings,
  isDigestEnabled,
  isDigestKindEnabled,
  isHostCommentsEnabled,
} from "./settings";

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

describe("isDigestKindEnabled", () => {
  it("falls back to the per-kind default for absent keys", () => {
    for (const kind of DIGEST_KINDS) {
      expect(isDigestKindEnabled({}, kind)).toBe(DIGEST_KIND_DEFAULTS[kind]);
      expect(isDigestKindEnabled(null, kind)).toBe(DIGEST_KIND_DEFAULTS[kind]);
      expect(isDigestKindEnabled(undefined, kind)).toBe(
        DIGEST_KIND_DEFAULTS[kind],
      );
    }
  });

  it("follows an explicit per-kind switch", () => {
    expect(isDigestKindEnabled({ hearts: false }, "hearts")).toBe(false);
    expect(isDigestKindEnabled({ drafts: true }, "drafts")).toBe(true);
    // Other kinds keep their defaults around an explicit neighbour.
    expect(isDigestKindEnabled({ hearts: false }, "replies")).toBe(
      DIGEST_KIND_DEFAULTS.replies,
    );
  });
});

describe("effectiveDigestSettings", () => {
  it("falls back to the user's globals, then daily/Monday", () => {
    expect(effectiveDigestSettings({}, {})).toEqual({
      enabled: false,
      frequency: "daily",
      weekday: 1,
      kinds: {},
    });
    expect(
      effectiveDigestSettings(null, {
        digestEnabled: true,
        digestFrequency: "weekly",
        digestWeekday: 4,
      }),
    ).toEqual({ enabled: true, frequency: "weekly", weekday: 4, kinds: {} });
  });

  it("lets the membership override each field independently", () => {
    expect(
      effectiveDigestSettings(
        { enabled: false, kinds: { hearts: false } },
        { digestEnabled: true, digestFrequency: "weekly" },
      ),
    ).toEqual({
      enabled: false,
      frequency: "weekly",
      weekday: 1,
      kinds: { hearts: false },
    });
  });

  it("honours the legacy per-section opt-in through the fallback", () => {
    expect(effectiveDigestSettings({}, { digestReplies: true }).enabled).toBe(
      true,
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
