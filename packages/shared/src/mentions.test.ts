import { describe, expect, it } from "vitest";

import { parseMentionHandles } from "./mentions";

describe("parseMentionHandles", () => {
  it("extracts unique lowercased handles", () => {
    expect(
      parseMentionHandles("hey @jane-doe and @Bob, also @jane-doe"),
    ).toEqual(["jane-doe", "bob"]);
  });

  it("ignores email addresses", () => {
    expect(parseMentionHandles("mail me at foo@example.com")).toEqual([]);
  });

  it("returns nothing when there are no mentions", () => {
    expect(parseMentionHandles("just a plain comment")).toEqual([]);
  });

  it("handles a mention at the start of the string", () => {
    expect(parseMentionHandles("@nick nice one")).toEqual(["nick"]);
  });
});
