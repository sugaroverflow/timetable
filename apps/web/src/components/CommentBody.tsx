import { Fragment, type ReactNode } from "react";

import { splitLinks } from "@/lib/linkify";

// Boundary + @handle, so emails don't highlight. Only the @handle is styled.
const MENTION_RE = /(^|[^A-Za-z0-9_@])@([a-z0-9][a-z0-9-]*)/gi;

/** Comment body as plain text with URLs linked and @mentions highlighted
 * (product feedback rounds 1 and 3). Bodies are stored/rendered as plain
 * text — links and mention tokens are built as React nodes, no HTML is
 * interpreted. URLs are split out first so a path like /@user inside one
 * doesn't read as a mention. */
export function CommentBody({ body }: { body: string }) {
  const nodes: ReactNode[] = [];
  let key = 0;
  for (const segment of splitLinks(body)) {
    if (segment.kind === "link") {
      nodes.push(
        <a
          key={key++}
          href={segment.href}
          target="_blank"
          rel="noopener noreferrer"
        >
          {segment.text}
        </a>,
      );
      continue;
    }
    const text = segment.text;
    let last = 0;
    for (const m of text.matchAll(MENTION_RE)) {
      const full = m[0];
      const boundary = m[1] ?? "";
      const handle = m[2] ?? "";
      const start = m.index ?? 0;
      if (start > last) nodes.push(text.slice(last, start));
      if (boundary) nodes.push(boundary);
      nodes.push(
        <span key={key++} className="mention-token">
          @{handle}
        </span>,
      );
      last = start + full.length;
    }
    if (last < text.length) nodes.push(text.slice(last));
  }
  return <Fragment>{nodes}</Fragment>;
}
