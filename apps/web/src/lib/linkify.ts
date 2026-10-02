export type BodySegment =
  | { kind: "text"; text: string }
  | { kind: "link"; text: string; href: string };

// http(s) URLs plus bare www. hosts. \b keeps "foowww.x" from matching.
const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"]+/gi;

// Punctuation that reads as sentence-trailing, not part of the URL.
const TRAILING_PUNCT = /[.,;:!?'"’”…]$/;

const CLOSERS: Record<string, string> = { ")": "(", "]": "[", "}": "{" };

function count(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

/** Trim sentence punctuation and unbalanced closing brackets off a URL match,
 * so "see https://a.b/c)." links "https://a.b/c" but a Wikipedia-style
 * "https://a.b/c_(d)" keeps its balanced parens. */
function trimUrl(url: string): string {
  let u = url;
  for (;;) {
    if (TRAILING_PUNCT.test(u)) {
      u = u.slice(0, -1);
      continue;
    }
    const opener = CLOSERS[u.slice(-1)];
    if (opener && count(u, u.slice(-1)) > count(u, opener)) {
      u = u.slice(0, -1);
      continue;
    }
    return u;
  }
}

/** Split plain text into text/link segments. Pure so it can be unit-tested;
 * CommentBody renders link segments as anchors and no HTML is ever
 * interpreted. */
export function splitLinks(body: string): BodySegment[] {
  const out: BodySegment[] = [];
  let last = 0;
  for (const m of body.matchAll(URL_RE)) {
    const url = trimUrl(m[0]);
    const start = m.index ?? 0;
    // A bare scheme or "www." with nothing meaningful after isn't a link.
    if (/^(?:https?:\/\/|www\.)$/i.test(url) || !url.includes(".")) continue;
    if (start > last) out.push({ kind: "text", text: body.slice(last, start) });
    out.push({
      kind: "link",
      text: url,
      href: /^https?:\/\//i.test(url) ? url : `https://${url}`,
    });
    last = start + url.length;
  }
  if (last < body.length) out.push({ kind: "text", text: body.slice(last) });
  return out;
}
