import { describe, expect, it } from "vitest";

import {
  formatVanityAddress,
  matchVanityRoute,
  parseVanityAddress,
} from "./vanityAddress";

describe("parseVanityAddress", () => {
  it("accepts a bare hostname", () => {
    expect(parseVanityAddress("forum.example.org")).toEqual({
      host: "forum.example.org",
      pathPrefix: "",
    });
  });

  it("accepts a hostname with a path prefix", () => {
    expect(parseVanityAddress("topic.newspeak.house/2026")).toEqual({
      host: "topic.newspeak.house",
      pathPrefix: "/2026",
    });
  });

  it("canonicalises scheme, case, whitespace and trailing slashes", () => {
    expect(
      parseVanityAddress("  HTTPS://Topic.Newspeak.House/2026/  "),
    ).toEqual({ host: "topic.newspeak.house", pathPrefix: "/2026" });
  });

  it("keeps multi-segment prefixes", () => {
    expect(parseVanityAddress("example.org/a/b")?.pathPrefix).toBe("/a/b");
  });

  it("rejects what is not an address", () => {
    for (const bad of [
      "",
      "   ",
      "localhost",
      "example.org:8080",
      "example.org//2026",
      "example.org/20 26",
      "example.org/2026?x=1",
      "-bad.example.org",
      "http://",
    ]) {
      expect(parseVanityAddress(bad), bad).toBeNull();
    }
  });

  it("round-trips through the stored form", () => {
    const parsed = parseVanityAddress("topic.newspeak.house/2026");
    expect(parsed && formatVanityAddress(parsed)).toBe(
      "topic.newspeak.house/2026",
    );
    const bare = parseVanityAddress("forum.example.org");
    expect(bare && formatVanityAddress(bare)).toBe("forum.example.org");
  });
});

describe("matchVanityRoute", () => {
  const routes = [
    { slug: "nh-2026", pathPrefix: "/2026" },
    { slug: "nh-2026-summer", pathPrefix: "/2026/summer" },
    { slug: "nh-2027", pathPrefix: "/2027" },
  ];

  it("matches the prefix exactly and carries nothing over", () => {
    expect(matchVanityRoute(routes, "/2026")).toEqual({
      slug: "nh-2026",
      rest: "",
    });
    expect(matchVanityRoute(routes, "/2026/")).toEqual({
      slug: "nh-2026",
      rest: "",
    });
  });

  it("carries the remaining path into the forum", () => {
    expect(matchVanityRoute(routes, "/2027/topics")).toEqual({
      slug: "nh-2027",
      rest: "/topics",
    });
  });

  it("prefers the longest prefix", () => {
    expect(matchVanityRoute(routes, "/2026/summer/people")).toEqual({
      slug: "nh-2026-summer",
      rest: "/people",
    });
  });

  it("only matches on a segment boundary", () => {
    expect(matchVanityRoute(routes, "/20261")).toBeNull();
    expect(matchVanityRoute(routes, "/2026-extra/topics")).toBeNull();
  });

  it("returns null for the root and unknown paths when no bare-host route", () => {
    expect(matchVanityRoute(routes, "/")).toBeNull();
    expect(matchVanityRoute(routes, "/2025")).toBeNull();
  });

  it("a bare-host route catches everything the prefixed ones don't", () => {
    const withBare = [...routes, { slug: "school", pathPrefix: "" }];
    expect(matchVanityRoute(withBare, "/")).toEqual({
      slug: "school",
      rest: "",
    });
    expect(matchVanityRoute(withBare, "/calendar")).toEqual({
      slug: "school",
      rest: "/calendar",
    });
    expect(matchVanityRoute(withBare, "/2026/topics")).toEqual({
      slug: "nh-2026",
      rest: "/topics",
    });
  });
});
