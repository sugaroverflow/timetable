import { describe, expect, it } from "vitest";

import { renderDigest, sampleDigest } from "./email";

const SAMPLE = sampleDigest({
  email: "admin@example.com",
  name: "Ada",
  forumName: "Sparkle Bureaucracy",
  forumSlug: "sparkle",
});

describe("renderDigest", () => {
  it("summarises the counts in the subject", () => {
    const { subject } = renderDigest(SAMPLE);
    expect(subject).toContain("2 new topics");
    expect(subject).toContain("1 reply");
  });

  it("renders every section inside the branded shell", () => {
    const { html } = renderDigest(SAMPLE);
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("Topic</td>"); // wordmark header cell
    expect(html).toContain("New topics");
    expect(html).toContain("Replies to your comments");
    expect(html).toContain("Activity on your topics");
    expect(html).toContain("You have a topic");
    expect(html).toContain("Hi Ada,");
    expect(html).toContain("/f/sparkle/topics");
    // Footer: how to turn it off.
    expect(html).toContain("switched on email digests");
  });

  it("escapes user-controlled text", () => {
    const { html } = renderDigest({
      ...SAMPLE,
      newTopics: [
        {
          title: "<script>alert(1)</script>",
          timetableName: "<b>Forum</b>",
          path: null,
        },
      ],
      replies: [],
      hostActivity: [],
      assignedTopics: [],
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<b>Forum</b>");
  });
});
