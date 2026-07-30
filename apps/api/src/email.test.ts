import type { ForumDigest } from "@timetable/core";
import { describe, expect, it } from "vitest";

import { renderDigest, sampleDigest } from "./email";

const SAMPLE = sampleDigest({
  email: "admin@example.com",
  name: "Ada",
  forumId: "forum-1",
  forumName: "Sparkle Bureaucracy",
  forumSlug: "sparkle",
  accent: "#1f7a4d",
});

describe("renderDigest (v3, topic cards)", () => {
  it("subjects and brands as '{Forum} Topics Digest'", () => {
    const { subject, html } = renderDigest(SAMPLE);
    expect(subject).toMatch(/^Sparkle Bureaucracy Topics Digest — /);
    expect(subject).toContain("comments on your topics");
    expect(subject).toContain("1 new topic");
    expect(html).toContain(">Sparkle Bureaucracy Topics</td>");
    expect(html).toContain("#1f7a4d");
    expect(html).not.toContain("Hi Ada");
  });

  it("orders your-content first and gives each topic its own card", () => {
    const { html } = renderDigest(SAMPLE);
    const discussionAt = html.indexOf("Count me in");
    const newAt = html.indexOf("Open data standards for local councils");
    expect(discussionAt).toBeGreaterThan(-1);
    expect(newAt).toBeGreaterThan(-1);
    expect(discussionAt).toBeLessThan(newAt);
    const cards = html.split("border-radius:12px").length - 1;
    expect(cards).toBeGreaterThanOrEqual(6);
  });

  it("shows status as a pill and the topic body (truncated) on status cards", () => {
    const { html } = renderDigest(SAMPLE);
    expect(html).toContain("Assigned to you");
    expect(html).toContain("Unpublished draft");
    expect(html).toContain("New</span>");
    // Long new-topic body is truncated with a Show more link.
    expect(html).toContain("Councils publish the same kinds of data");
    expect(html).toContain("Show more →");
  });

  it("merges a multi-reply thread into one tree (shared ancestors once)", () => {
    const { html } = renderDigest(SAMPLE);
    // The two ancestors appear a single time despite three replies below.
    const ancestor = "sketched three options";
    expect(html.split(ancestor).length - 1).toBe(1);
    // Three distinct replies, the deepest nested (indented further).
    expect(html).toContain("needs a quorum rule");
    expect(html).toContain("handles ties better");
    expect(html).toContain("two-thirds quorum");
    expect(html).toContain("padding-left:48px");
  });

  it("labels host-only and you-and-admin threads (regular unlabeled)", () => {
    const { html } = renderDigest(SAMPLE);
    expect(html).toContain("Hosts only");
    expect(html).toContain("You and Admins");
    expect(html).toContain("Between us hosts");
    expect(html).toContain("tighten the opening paragraph");
    // Regular public comment has no label above it.
    expect(html).not.toContain("Public only");
  });

  it("names each hearter on its own line as plain (unlinked) text", () => {
    const { html } = renderDigest(SAMPLE);
    expect(html).toContain("❤️ ");
    // Hearter names are plain bold text, not profile links.
    expect(html).toContain("❤️ <strong>Amara Okafor</strong>");
    expect(html).not.toContain("/f/sparkle/sample-amara");
    expect(html).not.toContain("/f/sparkle/sample-kwame");
    // A rule separates the comment section from the ❤️ section.
    expect(html).toContain("border-top:1px solid");
  });

  it("builds Reply deep-links; commenters plain, byline still linked", () => {
    const { html } = renderDigest(SAMPLE);
    expect(html).toContain("?reply=garden-robin#comment-garden-robin");
    expect(html).toContain("Reply →");
    // Commenter names are plain bold text, not profile links…
    expect(html).toContain("<strong>Robin Vale</strong>");
    expect(html).not.toContain("/f/sparkle/sample-robin");
    // …but the topic author's byline still links to their profile.
    expect(html).toContain("/f/sparkle/sample-marcus");
  });

  it("escapes user-controlled text", () => {
    const evil: ForumDigest = {
      ...SAMPLE,
      topics: [
        {
          topicId: "x",
          title: "<script>alert(1)</script>",
          author: { name: "<b>Eve</b>", userId: "u1", image: null },
          body: "<img src=x onerror=alert(1)>",
          path: null,
          activities: [
            {
              kind: "comment",
              visibility: "public",
              comment: {
                id: "c1",
                parentId: null,
                author: { name: "<i>Mallory</i>", userId: "u2", image: null },
                body: "<svg onload=alert(1)>",
              },
              ancestors: [],
              at: new Date("2026-07-30T00:00:00Z"),
            },
            {
              kind: "heart",
              hearters: [{ name: "<u>Trudy</u>", userId: "u3", image: null }],
              at: new Date("2026-07-30T00:00:00Z"),
            },
          ],
        },
      ],
    };
    const { html } = renderDigest(evil);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<b>Eve</b>");
    expect(html).not.toContain("<svg onload");
    expect(html).not.toContain("<u>Trudy</u>");
  });
});
