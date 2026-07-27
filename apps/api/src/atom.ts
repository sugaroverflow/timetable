/** Atom feed construction (agent-access roadmap phase 1, QA 2026-07-27):
 * pure string building so it unit-tests without a server. Atom over RSS 2.0
 * for unambiguous dates (RFC 3339) and explicit content typing; every
 * mainstream reader consumes both. */

const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c] ?? c,
  );

export type AtomEntry = {
  /** Stable identity — survives title/slug renames (we use urn:uuid:…). */
  id: string;
  title: string;
  url: string;
  updated: Date;
  published: Date | null;
  authorName: string | null;
  /** Already-sanitized HTML (the shared renderMarkdown pipeline). */
  contentHtml: string;
};

export function buildAtomFeed(args: {
  title: string;
  subtitle: string;
  feedUrl: string;
  siteUrl: string;
  entries: AtomEntry[];
}): string {
  const updated =
    args.entries.length > 0
      ? new Date(Math.max(...args.entries.map((e) => e.updated.getTime())))
      : new Date(0);
  const entries = args.entries.map((e) =>
    [
      `  <entry>`,
      `    <id>${esc(e.id)}</id>`,
      `    <title>${esc(e.title)}</title>`,
      `    <link rel="alternate" type="text/html" href="${esc(e.url)}"/>`,
      `    <updated>${e.updated.toISOString()}</updated>`,
      ...(e.published
        ? [`    <published>${e.published.toISOString()}</published>`]
        : []),
      ...(e.authorName
        ? [`    <author><name>${esc(e.authorName)}</name></author>`]
        : []),
      `    <content type="html">${esc(e.contentHtml)}</content>`,
      `  </entry>`,
    ].join("\n"),
  );
  return [
    `<?xml version="1.0" encoding="utf-8"?>`,
    `<feed xmlns="http://www.w3.org/2005/Atom">`,
    `  <id>${esc(args.feedUrl)}</id>`,
    `  <title>${esc(args.title)}</title>`,
    `  <subtitle>${esc(args.subtitle)}</subtitle>`,
    `  <link rel="self" type="application/atom+xml" href="${esc(args.feedUrl)}"/>`,
    `  <link rel="alternate" type="text/html" href="${esc(args.siteUrl)}"/>`,
    `  <updated>${updated.toISOString()}</updated>`,
    ...entries,
    `</feed>`,
    ``,
  ].join("\n");
}
