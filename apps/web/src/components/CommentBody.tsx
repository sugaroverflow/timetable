import { Fragment, type ReactNode } from "react";

// Boundary + @handle, so emails don't highlight. Only the @handle is styled.
const MENTION_RE = /(^|[^A-Za-z0-9_@])@([a-z0-9][a-z0-9-]*)/gi;

/** Comment body as plain text with @mentions highlighted (product feedback
 * round 1). Bodies are stored/rendered as plain text, so this only adds a
 * visual token — no HTML is interpreted. */
export function CommentBody({ body }: { body: string }) {
  const nodes: ReactNode[] = [];
  let last = 0;
  let key = 0;
  for (const m of body.matchAll(MENTION_RE)) {
    const full = m[0];
    const boundary = m[1] ?? "";
    const handle = m[2] ?? "";
    const start = m.index ?? 0;
    if (start > last) nodes.push(body.slice(last, start));
    if (boundary) nodes.push(boundary);
    nodes.push(
      <span key={key++} className="mention-token">
        @{handle}
      </span>,
    );
    last = start + full.length;
  }
  if (last < body.length) nodes.push(body.slice(last));
  return <Fragment>{nodes}</Fragment>;
}
