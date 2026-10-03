import { describe, expect, it } from "vitest";

import { normalizeReaction } from "./lounge";
import { canReadLounge, canUseLounge } from "./permissions";
import { isLoungeEnabled, digestKindApplies } from "./settings";

describe("normalizeReaction", () => {
  it("accepts single emoji, including sequences, skin tones and flags", () => {
    expect(normalizeReaction("👍")).toBe("👍");
    expect(normalizeReaction(" 🎉 ")).toBe("🎉");
    expect(normalizeReaction("👍🏽")).toBe("👍🏽");
    expect(normalizeReaction("👩‍💻")).toBe("👩‍💻");
    expect(normalizeReaction("🇬🇧")).toBe("🇬🇧");
    expect(normalizeReaction("1️⃣")).toBe("1️⃣");
  });

  it("refuses ❤️ and 💙 — weighted votes, not reactions", () => {
    expect(normalizeReaction("❤️")).toBeNull();
    expect(normalizeReaction("❤")).toBeNull();
    expect(normalizeReaction("💙")).toBeNull();
  });

  it("refuses text, empty input and several emoji", () => {
    expect(normalizeReaction("")).toBeNull();
    expect(normalizeReaction("a")).toBeNull();
    expect(normalizeReaction("1")).toBeNull();
    expect(normalizeReaction(":)")).toBeNull();
    expect(normalizeReaction("👍👍")).toBeNull();
    expect(normalizeReaction("👍 ok")).toBeNull();
  });
});

describe("canUseLounge", () => {
  const as = (...roles: string[]) =>
    canUseLounge({ userId: "u", roles: roles as never });

  it("admits hosts, admins and owners", () => {
    expect(as("host")).toBe(true);
    expect(as("admin")).toBe(true);
    expect(as("owner", "admin")).toBe(true);
    expect(as("host", "elector")).toBe(true);
  });

  it("never admits electors, role-less or anonymous viewers", () => {
    expect(as("elector")).toBe(false);
    expect(as()).toBe(false);
    expect(canUseLounge({ userId: null, roles: ["host"] })).toBe(false);
  });
});

describe("Lounge settings", () => {
  it("is off unless switched on", () => {
    expect(isLoungeEnabled({})).toBe(false);
    expect(isLoungeEnabled({ lounge: {} })).toBe(false);
    expect(isLoungeEnabled({ lounge: { enabled: true } })).toBe(true);
  });

  it("its digest kind reaches hosts and admins, not electors", () => {
    expect(digestKindApplies("lounge", ["host"])).toBe(true);
    expect(digestKindApplies("lounge", ["admin"])).toBe(true);
    expect(digestKindApplies("lounge", ["elector"])).toBe(false);
  });
});

describe("canReadLounge", () => {
  const on = { lounge: { enabled: true } };
  it("needs the room switched on AND a host or admin", () => {
    expect(canReadLounge(on, { userId: "u", roles: ["host"] })).toBe(true);
    expect(canReadLounge(on, { userId: "u", roles: ["owner"] })).toBe(true);
    expect(canReadLounge(on, { userId: "u", roles: ["elector"] })).toBe(false);
    // Deactivated members resolve to no roles.
    expect(canReadLounge(on, { userId: "u", roles: [] })).toBe(false);
    expect(canReadLounge({}, { userId: "u", roles: ["admin"] })).toBe(false);
  });
});
