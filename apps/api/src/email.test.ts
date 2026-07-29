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

describe("renderDigest (v2, per-forum)", () => {
  it("subjects as [Forum] Digest with the count summary", () => {
    const { subject } = renderDigest(SAMPLE);
    expect(subject).toMatch(/^\[Sparkle Bureaucracy\] Digest — /);
    expect(subject).toContain("1 comment on your topics");
    expect(subject).toContain("2 new topics");
  });

  it("brands the shell as the forum and leads with full-text comments", () => {
    const { html } = renderDigest(SAMPLE);
    expect(html).toContain("<!doctype html>");
    // Forum name is the wordmark, in the forum's accent colour.
    expect(html).toContain(">Sparkle Bureaucracy</td>");
    expect(html).toContain("#1f7a4d");
    // Comments (full text) come before every other section.
    const commentsAt = html.indexOf("Comments on your topics");
    expect(commentsAt).toBeGreaterThan(-1);
    expect(commentsAt).toBeLessThan(html.indexOf("Replies to your comments"));
    expect(commentsAt).toBeLessThan(html.indexOf("New topics"));
    expect(html).toContain("could we pair it with the newcomers session?");
    // Drafts section rides along; footer links THIS forum's notifications.
    expect(html).toContain("Your unpublished drafts");
    expect(html).toContain("/f/sparkle/notifications");
    // The old cross-forum intro is gone.
    expect(html).not.toContain("Since your last digest");
  });

  it("escapes user-controlled text", () => {
    const { html } = renderDigest({
      ...SAMPLE,
      comments: [
        {
          topicTitle: "<script>alert(1)</script>",
          by: "<b>Eve</b>",
          body: "<img src=x onerror=alert(1)>",
          path: null,
        },
      ],
      replies: [],
      newTopics: [],
      heartActivity: [],
      drafts: [],
      assignedTopics: [],
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<b>Eve</b>");
    expect(html).not.toContain("<img src=x");
  });
});
