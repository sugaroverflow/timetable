import { describe, expect, it } from "vitest";

import { profileAudience } from "./profileLabels";

describe("profileAudience", () => {
  it("names the internet only where the public can read the bio", () => {
    expect(profileAudience("public", ["elector"])).toMatch(/search engines/);
    expect(profileAudience("no_comments", ["elector"])).toMatch(/search/);
    expect(profileAudience("hosts_only", ["host"])).toMatch(/search/);
  });

  it("says members only everywhere else", () => {
    expect(profileAudience("private", ["admin"])).toMatch(/Only members/);
    expect(profileAudience("hosts_only", ["elector"])).toMatch(/Only members/);
  });
});
