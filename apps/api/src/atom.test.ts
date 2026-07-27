import { describe, expect, it } from "vitest";

import { buildAtomFeed, type AtomEntry } from "./atom";

const ENTRY: AtomEntry = {
  id: "urn:uuid:11111111-2222-3333-4444-555555555555",
  title: `Ampersands & <angles> in "titles"`,
  url: "https://topic.forum/f/demo/jo/space-elevators",
  updated: new Date("2026-07-27T12:00:00Z"),
  published: new Date("2026-07-20T09:00:00Z"),
  authorName: "Jo & Co",
  contentHtml: "<p>Body with <strong>markup</strong> & entities</p>",
};

function feed(entries: AtomEntry[] = [ENTRY]) {
  return buildAtomFeed({
    title: "Demo Forum",
    subtitle: "Published topics",
    feedUrl: "https://topic.forum/api/timetables/demo/feed.atom",
    siteUrl: "https://topic.forum/f/demo/topics",
    entries,
  });
}

describe("buildAtomFeed", () => {
  it("produces a well-formed skeleton with self and site links", () => {
    const xml = feed();
    expect(xml).toContain(`<?xml version="1.0" encoding="utf-8"?>`);
    expect(xml).toContain(`<feed xmlns="http://www.w3.org/2005/Atom">`);
    expect(xml).toContain(
      `<link rel="self" type="application/atom+xml" href="https://topic.forum/api/timetables/demo/feed.atom"/>`,
    );
    expect(xml).toContain(`</feed>`);
  });

  it("escapes XML in titles, authors, and content", () => {
    const xml = feed();
    expect(xml).toContain(
      "Ampersands &amp; &lt;angles&gt; in &quot;titles&quot;",
    );
    expect(xml).toContain("<author><name>Jo &amp; Co</name></author>");
    // HTML content ships escaped inside content type="html".
    expect(xml).toContain(
      "&lt;p&gt;Body with &lt;strong&gt;markup&lt;/strong&gt; &amp; entities&lt;/p&gt;",
    );
    expect(xml).not.toContain("<p>Body");
  });

  it("uses the newest entry's updated as the feed's updated", () => {
    const xml = feed([
      ENTRY,
      { ...ENTRY, id: "urn:uuid:2", updated: new Date("2026-07-27T15:30:00Z") },
    ]);
    expect(xml).toContain("<updated>2026-07-27T15:30:00.000Z</updated>");
  });

  it("omits published/author when absent", () => {
    const xml = feed([{ ...ENTRY, published: null, authorName: null }]);
    expect(xml).not.toContain("<published>");
    expect(xml).not.toContain("<author>");
  });
});
