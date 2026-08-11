import { isForumDigestEmpty, type ForumDigest } from "@timetable/core";
import { describe, expect, it } from "vitest";

import {
  linkBase,
  renderDigest,
  sampleDigest,
  wrapLinksWithSignInTicket,
} from "./email";

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
    expect(subject).toContain("10 comments");
    expect(subject).toContain("2 new topics");
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

  it("renders 💙s from fellow hosts under the ❤️s (host hearts)", () => {
    const withHostHearts: ForumDigest = {
      ...SAMPLE,
      topics: [
        {
          ...SAMPLE.topics[0]!,
          activities: [
            ...SAMPLE.topics[0]!.activities,
            {
              kind: "hostHeart",
              hearters: [{ name: "Eli Morgan", userId: "u9", image: null }],
              at: new Date("2026-07-30T00:00:00Z"),
            },
          ],
        },
        ...SAMPLE.topics.slice(1),
      ],
    };
    const { html } = renderDigest(withHostHearts);
    expect(html).toContain("💙 <strong>Eli Morgan</strong>");
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

describe("renderDigest calendar content (calendar v2)", () => {
  const sessionCard = SAMPLE.topics.find((c) =>
    c.activities.some((a) => a.kind === "session"),
  )!;

  it("renders the confirmed session inside its topic's card, not a section", () => {
    const { html } = renderDigest(SAMPLE);
    expect(html).not.toContain("Coming up");
    // The session's when-line and register link ride the ranked-choice card.
    expect(html).toContain("Tue 4 Aug, 18:00–20:00 · Classroom");
    expect(html).toContain("Register → lu.ma/sample-rcv");
    // The ask is still its own section, before the cards.
    const ask = html.indexOf("Can you make it?");
    const card = html.indexOf("sketched three options");
    expect(ask).toBeGreaterThan(-1);
    expect(card).toBeGreaterThan(ask);
  });

  it("counts fresh sessions into the subject", () => {
    const { subject } = renderDigest(SAMPLE);
    expect(subject).toContain("3 sessions confirmed");
    expect(subject).toContain("2 sessions want your availability");
  });

  it("links URL-less sessions to the forum calendar", () => {
    // The sample ask carries no URL → it points at the calendar page.
    expect(renderDigest(SAMPLE).html).toContain("/f/sparkle/calendar");
  });

  it("standing session listings alone never make a digest non-empty", () => {
    const staleSession = (isNew: boolean): ForumDigest => ({
      ...SAMPLE,
      topics: [
        {
          ...sessionCard,
          activities: sessionCard.activities
            .filter((a) => a.kind === "session")
            .map((a) =>
              a.kind === "session"
                ? { ...a, session: { ...a.session, isNew } }
                : a,
            ),
        },
      ],
      availabilityAsks: [],
      newSlots: [],
      newMembers: [],
    });
    expect(isForumDigestEmpty(staleSession(false))).toBe(true);
    expect(isForumDigestEmpty(staleSession(true))).toBe(false);
  });
});

describe("wrapLinksWithSignInTicket (one-click digest links)", () => {
  const ticket = "tok_abc+/=";

  it("wraps every app link in the rendered digest, preserving destinations", () => {
    const { html } = renderDigest(SAMPLE);
    const wrapped = wrapLinksWithSignInTicket(html, ticket);
    // Every remaining app href goes through /sign-in with the ticket…
    const appHrefs = [...wrapped.matchAll(/href="([^"]*)"/g)]
      .map((m) => m[1]!.replace(/&amp;/g, "&"))
      .filter((u) => u.startsWith(linkBase));
    expect(appHrefs.length).toBeGreaterThan(0);
    for (const href of appHrefs) {
      expect(href).toContain("/sign-in?__clerk_ticket=");
    }
    // …and the original destination rides redirect_url, decodable.
    const first = new URL(appHrefs[0]!);
    const dest = first.searchParams.get("redirect_url");
    expect(dest).toMatch(/^\//);
  });

  it("wraps only linkBase URLs and keeps sign-in links untouched", () => {
    const html = [
      `<a href="${linkBase}/f/sparkle/topics?sort=new&amp;q=x">in</a>`,
      `<a href="https://elsewhere.example/page">out</a>`,
      `<a href="${linkBase}/sign-in?redirect_url=%2Ff%2Fsparkle">already</a>`,
    ].join("");
    const wrapped = wrapLinksWithSignInTicket(html, ticket);
    expect(wrapped).toContain("https://elsewhere.example/page");
    expect(wrapped).toContain(
      `${linkBase}/sign-in?redirect_url=%2Ff%2Fsparkle`,
    );
    const inbound = new URL(
      /href="([^"]*sign-in\?__clerk_ticket[^"]*)"/
        .exec(wrapped)![1]!
        .replace(/&amp;/g, "&"),
    );
    expect(inbound.searchParams.get("__clerk_ticket")).toBe(ticket);
    expect(inbound.searchParams.get("redirect_url")).toBe(
      "/f/sparkle/topics?sort=new&q=x",
    );
  });

  it("treats a bare linkBase link as the root path", () => {
    const wrapped = wrapLinksWithSignInTicket(
      `<a href="${linkBase}">home</a>`,
      ticket,
    );
    const url = new URL(
      /href="([^"]*)"/.exec(wrapped)![1]!.replace(/&amp;/g, "&"),
    );
    expect(url.pathname).toBe("/sign-in");
    expect(url.searchParams.get("redirect_url")).toBe("/");
  });
});
