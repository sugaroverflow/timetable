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
  it("subjects as [Forum] Digest with the count summary", () => {
    const { subject } = renderDigest(SAMPLE);
    expect(subject).toMatch(/^\[Sparkle Bureaucracy\] Digest — /);
    expect(subject).toContain("1 comment on your topics");
    expect(subject).toContain("1 reply");
    expect(subject).toContain("1 new topic");
  });

  it("brands the shell as the forum and orders your-content first", () => {
    const { html } = renderDigest(SAMPLE);
    expect(html).toContain("<!doctype html>");
    expect(html).toContain(">Sparkle Bureaucracy</td>");
    expect(html).toContain("#1f7a4d");
    // Your-content cards (reply/comment/heart) come before the new topic.
    const replyAt = html.indexOf("replied to your comment");
    const newAt = html.indexOf("Newly published");
    expect(replyAt).toBeGreaterThan(-1);
    expect(newAt).toBeGreaterThan(-1);
    expect(replyAt).toBeLessThan(newAt);
    // "Author: Title" heading + footer to THIS forum's notifications.
    expect(html).toContain("Priya Okafor: ");
    expect(html).toContain("/f/sparkle/notifications");
  });

  it("names every hearter (no cap) and builds Reply deep-links", () => {
    const { html } = renderDigest(SAMPLE);
    expect(html).toContain("Amara Okafor");
    expect(html).toContain("Kwame Mensah");
    // Reply link is the topic permalink with the ?reply anchor.
    expect(html).toContain("?reply=sample-comment-1#comment-sample-comment-1");
    expect(html).toContain("Reply →");
  });

  it("shows the full ancestor chain above a reply", () => {
    const { html } = renderDigest(SAMPLE);
    expect(html).toContain("Should we use raised beds");
    expect(html).toContain("Raised beds near the wall");
  });

  it("escapes user-controlled text", () => {
    const evil: ForumDigest = {
      ...SAMPLE,
      topics: [
        {
          topicId: "x",
          title: "<script>alert(1)</script>",
          author: "<b>Eve</b>",
          path: null,
          activities: [
            {
              kind: "comment",
              by: "<i>Mallory</i>",
              body: "<img src=x onerror=alert(1)>",
              replyToCommentId: "c1",
              at: new Date("2026-07-30T00:00:00Z"),
            },
            {
              kind: "heart",
              hearters: ["<u>Trudy</u>"],
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
