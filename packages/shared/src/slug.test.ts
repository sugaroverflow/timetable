import { describe, expect, it } from "vitest";

import { slugify } from "./slug";
import { normalizeEmail } from "./validation";

describe("slugify", () => {
  it("lowercases and hyphenates non-alphanumerics", () => {
    expect(slugify("Sparkle Bureaucracy!")).toBe("sparkle-bureaucracy");
    expect(slugify("a  __  b--c")).toBe("a-b-c");
  });

  it("ignores surrounding whitespace (former .trim())", () => {
    expect(slugify("  Spaced Out  ")).toBe("spaced-out");
  });

  it("falls back when nothing slug-worthy remains", () => {
    expect(slugify("!!!")).toBe("timetable"); // default (timetable names)
    expect(slugify("", "topic")).toBe("topic"); // topic titles
    expect(slugify("---", "user")).toBe("user"); // user display names
  });

  it("truncates to 60 chars", () => {
    expect(slugify("x".repeat(80))).toBe("x".repeat(60));
  });

  it("does not leave a dangling hyphen when truncation cuts at a word break", () => {
    // 59 chars + separator: char 60 lands on the hyphen.
    expect(slugify(`${"a".repeat(59)} bcd`)).toBe("a".repeat(59));
  });
});

describe("normalizeEmail", () => {
  it("trims and lowercases", () => {
    expect(normalizeEmail("  Ed@Newspeak.HOUSE ")).toBe("ed@newspeak.house");
    expect(normalizeEmail("plain@example.com")).toBe("plain@example.com");
  });
});
