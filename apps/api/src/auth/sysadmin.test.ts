import { describe, expect, it } from "vitest";

import { isSysadminEmail } from "./sysadmin";

const LIST = ["ed@example.com", "sugar@example.com"];

describe("isSysadminEmail", () => {
  it("matches listed emails case-insensitively", () => {
    expect(isSysadminEmail("ed@example.com", LIST)).toBe(true);
    expect(isSysadminEmail("Ed@Example.COM", LIST)).toBe(true);
  });

  it("rejects unlisted, null, and empty emails", () => {
    expect(isSysadminEmail("someone@example.com", LIST)).toBe(false);
    expect(isSysadminEmail(null, LIST)).toBe(false);
    expect(isSysadminEmail(undefined, LIST)).toBe(false);
    expect(isSysadminEmail("", LIST)).toBe(false);
  });

  it("rejects everything when the list is empty (prod default)", () => {
    expect(isSysadminEmail("ed@example.com", [])).toBe(false);
  });
});
