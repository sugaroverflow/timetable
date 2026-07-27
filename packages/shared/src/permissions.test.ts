import { describe, expect, it } from "vitest";

import { ANONYMOUS, canSeePersonProfile, type Viewer } from "./permissions";

const MEMBER: Viewer = { userId: "u1", roles: ["elector"] };
const SIGNED_IN_GUEST: Viewer = { userId: "u2", roles: [] };

describe("canSeePersonProfile", () => {
  it("members see every profile regardless of privacy", () => {
    expect(canSeePersonProfile("hosts_only", MEMBER, ["elector"])).toBe(true);
    expect(canSeePersonProfile("private", MEMBER, ["elector"])).toBe(true);
  });

  it("the public sees everyone on public and no_comments forums", () => {
    for (const privacy of ["public", "no_comments"] as const) {
      expect(canSeePersonProfile(privacy, ANONYMOUS, ["elector"])).toBe(true);
      expect(canSeePersonProfile(privacy, SIGNED_IN_GUEST, ["host"])).toBe(
        true,
      );
    }
  });

  it("hosts_only shows the public hosts and admins but never electors", () => {
    expect(canSeePersonProfile("hosts_only", ANONYMOUS, ["host"])).toBe(true);
    expect(canSeePersonProfile("hosts_only", ANONYMOUS, ["admin"])).toBe(true);
    expect(
      canSeePersonProfile("hosts_only", ANONYMOUS, ["owner", "admin"]),
    ).toBe(true);
    expect(canSeePersonProfile("hosts_only", ANONYMOUS, ["elector"])).toBe(
      false,
    );
    expect(
      canSeePersonProfile("hosts_only", SIGNED_IN_GUEST, ["elector"]),
    ).toBe(false);
  });
});
