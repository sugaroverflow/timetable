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
    expect(subject).toContain("1 comment on your topics");
    expect(subject).toContain("1 reply");
    // Wordmark is "{Forum} Topics", in the forum's accent.
    expect(html).toContain(">Sparkle Bureaucracy Topics</td>");
    expect(html).toContain("#1f7a4d");
    // No greeting.
    expect(html).not.toContain("Hi Ada");
  });

  it("orders your-content first and gives each topic its own card", () => {
    const { html } = renderDigest(SAMPLE);
    const replyAt = html.indexOf("Count me in");
    const newAt = html.indexOf("Newly published");
    expect(replyAt).toBeGreaterThan(-1);
    expect(newAt).toBeGreaterThan(-1);
    expect(replyAt).toBeLessThan(newAt);
    // One bordered card per topic (5 sample topics).
    const cards = html.split("border-radius:12px").length - 1;
    expect(cards).toBeGreaterThanOrEqual(5);
  });

  it("names each hearter on its own line, linked to their profile", () => {
    const { html } = renderDigest(SAMPLE);
    expect(html).toContain("❤️ ");
    expect(html).toContain("/f/sparkle/sample-amara");
    expect(html).toContain("/f/sparkle/sample-kwame");
  });

  it("threads a reply with its full ancestor chain and a Reply link", () => {
    const { html } = renderDigest(SAMPLE);
    expect(html).toContain("Should we use raised beds");
    expect(html).toContain("Raised beds near the wall");
    // Indented leaves: the reply sits deeper than its ancestors.
    expect(html).toContain("padding-left:32px");
    expect(html).toContain("?reply=sample-comment-1#comment-sample-comment-1");
    expect(html).toContain("Reply →");
  });

  it("links usernames to profile pages", () => {
    const { html } = renderDigest(SAMPLE);
    expect(html).toContain("/f/sparkle/sample-robin");
    expect(html).toContain("/f/sparkle/sample-priya");
  });

  it("escapes user-controlled text", () => {
    const evil: ForumDigest = {
      ...SAMPLE,
      topics: [
        {
          topicId: "x",
          title: "<script>alert(1)</script>",
          author: { name: "<b>Eve</b>", userId: "u1" },
          path: null,
          activities: [
            {
              kind: "comment",
              author: { name: "<i>Mallory</i>", userId: "u2" },
              body: "<img src=x onerror=alert(1)>",
              ancestors: [],
              replyToCommentId: "c1",
              at: new Date("2026-07-30T00:00:00Z"),
            },
            {
              kind: "heart",
              hearters: [{ name: "<u>Trudy</u>", userId: "u3" }],
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
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("<u>Trudy</u>");
  });
});
