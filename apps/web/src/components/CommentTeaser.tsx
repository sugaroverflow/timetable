"use client";

import { Collapsible } from "@base-ui/react/collapsible";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import { useSearchParams } from "next/navigation";

import type { FeedComment } from "@/lib/feedTypes";

function countNested(comments: FeedComment[]): number {
  return comments.reduce((sum, c) => sum + 1 + countNested(c.replies ?? []), 0);
}

function countNew(comments: FeedComment[], seen: number): number {
  return comments.reduce(
    (sum, c) =>
      sum +
      (Date.parse(c.createdAt) > seen ? 1 : 0) +
      countNew(c.replies ?? [], seen),
    0,
  );
}

/** True when the deep-linked comment lives in this tree — the teaser
 * auto-opens so ?reply= targets can render and focus their tail. */
function treeContains(comments: FeedComment[], id: string | null): boolean {
  if (!id) return false;
  return comments.some((c) => c.id === id || treeContains(c.replies ?? [], id));
}

/** One-line plain-text preview of a comment body. */
function snippet(body: string, max = 90): string {
  const text = body.replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/** The toggle's count text: new-since-last-visit when there is anything
 * new, total otherwise, an invitation when the thread is empty. */
function teaserLabel(total: number, fresh: number): string {
  if (total === 0) return "Add a comment…";
  if (fresh > 0) return `${fresh} new ${fresh === 1 ? "comment" : "comments"}`;
  return `${total} ${total === 1 ? "comment" : "comments"}`;
}

/** The collapsed state's latest-comment line. */
function TeaserSnippet({ latest }: { latest: FeedComment | null }) {
  if (!latest || latest.deleted) return null;
  return (
    <div className="teaser-snippet faint">
      <strong>{latest.authorName ?? "Someone"}</strong>: {snippet(latest.body)}
    </div>
  );
}

/**
 * The comment-teaser (dialogue-first threading, 2026-08-13): feed cards
 * collapse their discussion to the latest top-level comment plus a
 * new-comment count; clicking unfolds the full thread + composers in
 * place. The permalink page skips this and renders everything open.
 * Children are the server-rendered composer + CommentList.
 */
export function CommentTeaser({
  comments,
  lastSeenAt,
  canComment,
  children,
}: {
  comments: FeedComment[];
  /** The viewer's feed watermark — "new" means newer than this. */
  lastSeenAt: string | null;
  /** Shows an "Add a comment…" invitation when the thread is empty. */
  canComment: boolean;
  children: React.ReactNode;
}) {
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(() =>
    treeContains(comments, searchParams.get("reply")),
  );
  const total = countNested(comments);
  if (total === 0 && !canComment) return null;

  const fresh = lastSeenAt ? countNew(comments, Date.parse(lastSeenAt)) : 0;

  return (
    <Collapsible.Root
      className="comments-fold"
      open={open}
      onOpenChange={setOpen}
    >
      <Collapsible.Trigger className="comments-fold-toggle">
        {open ? (
          <ChevronDown size={14} aria-hidden />
        ) : (
          <ChevronRight size={14} aria-hidden />
        )}{" "}
        💬{" "}
        <span className={fresh > 0 ? "teaser-count-new" : ""}>
          {teaserLabel(total, fresh)}
        </span>
      </Collapsible.Trigger>
      {!open ? <TeaserSnippet latest={comments[0] ?? null} /> : null}
      <Collapsible.Panel>
        {open ? <div className="thread-stack">{children}</div> : null}
      </Collapsible.Panel>
    </Collapsible.Root>
  );
}
