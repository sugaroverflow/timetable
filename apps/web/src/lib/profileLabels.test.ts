import { describe, expect, it } from "vitest";

import { profileAudience, profileHeading } from "./profileLabels";

describe("profileHeading", () => {
  it("says Public Profile only where the public can read it", () => {
    expect(profileHeading("public", ["elector"])).toBe("Public Profile");
    expect(profileHeading("no_comments", ["elector"])).toBe("Public Profile");
    expect(profileHeading("hosts_only", ["host"])).toBe("Public Profile");
  });

  it("says Profile where only members can", () => {
    expect(profileHeading("private", ["host"])).toBe("Profile");
    expect(profileHeading("hosts_only", ["elector"])).toBe("Profile");
  });
});

describe("profileAudience", () => {
  it("matches the heading", () => {
    expect(profileAudience("public", ["elector"])).toMatch(/search engines/);
    expect(profileAudience("private", ["admin"])).toMatch(/Only members/);
  });
});
