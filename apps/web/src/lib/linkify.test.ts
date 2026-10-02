import { describe, expect, it } from "vitest";

import { splitLinks } from "./linkify";

describe("splitLinks", () => {
  it("passes plain text through as a single segment", () => {
    expect(splitLinks("no links here")).toEqual([
      { kind: "text", text: "no links here" },
    ]);
  });

  it("links a bare https URL", () => {
    expect(splitLinks("see https://example.com/x for details")).toEqual([
      { kind: "text", text: "see " },
      {
        kind: "link",
        text: "https://example.com/x",
        href: "https://example.com/x",
      },
      { kind: "text", text: " for details" },
    ]);
  });

  it("links http as well as https", () => {
    expect(splitLinks("http://example.com")).toEqual([
      { kind: "link", text: "http://example.com", href: "http://example.com" },
    ]);
  });

  it("prefixes bare www hosts with https in the href only", () => {
    expect(splitLinks("try www.example.com today")).toEqual([
      { kind: "text", text: "try " },
      {
        kind: "link",
        text: "www.example.com",
        href: "https://www.example.com",
      },
      { kind: "text", text: " today" },
    ]);
  });

  it("does not link www glued to a preceding word", () => {
    expect(splitLinks("foowww.example.com")).toEqual([
      { kind: "text", text: "foowww.example.com" },
    ]);
  });

  it("leaves sentence punctuation out of the link", () => {
    const segments = splitLinks("Read https://example.com/a.");
    expect(segments[1]).toEqual({
      kind: "link",
      text: "https://example.com/a",
      href: "https://example.com/a",
    });
    expect(segments[2]).toEqual({ kind: "text", text: "." });
  });

  it("drops an unbalanced closing paren but keeps a balanced one", () => {
    expect(splitLinks("(see https://example.com/a)")[1]).toMatchObject({
      text: "https://example.com/a",
    });
    expect(
      splitLinks("https://en.wikipedia.org/wiki/Foo_(bar)")[0],
    ).toMatchObject({
      text: "https://en.wikipedia.org/wiki/Foo_(bar)",
    });
  });

  it("handles multiple links and trailing text", () => {
    const segments = splitLinks(
      "a https://one.example b https://two.example c",
    );
    expect(segments.map((s) => s.kind)).toEqual([
      "text",
      "link",
      "text",
      "link",
      "text",
    ]);
  });

  it("ignores a bare scheme or bare www.", () => {
    expect(splitLinks("https:// and www. alone")).toEqual([
      { kind: "text", text: "https:// and www. alone" },
    ]);
  });

  it("does not treat emails as links", () => {
    expect(splitLinks("mail me at ed@example.com")).toEqual([
      { kind: "text", text: "mail me at ed@example.com" },
    ]);
  });
});
