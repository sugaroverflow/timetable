"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { clientGql } from "@/lib/clientGraphql";

const REPLY = `mutation Reply($id: String!, $body: String!) {
  replyToComment(commentId: $id, body: $body) { id }
}`;

const HIDE = `mutation Hide($id: String!, $hidden: Boolean!) {
  hideComment(commentId: $id, hidden: $hidden) { id }
}`;

export function CommentActions({
  commentId,
  canReply,
  canModerate,
  hidden,
}: {
  commentId: string;
  canReply: boolean;
  canModerate: boolean;
  hidden: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [pending, startTransition] = useTransition();

  async function reply(e: React.FormEvent) {
    e.preventDefault();
    const text = body.trim();
    if (!text) return;
    try {
      await clientGql(REPLY, { id: commentId, body: text });
      setBody("");
      setOpen(false);
      startTransition(() => router.refresh());
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not reply");
    }
  }

  async function toggleHidden() {
    try {
      await clientGql(HIDE, { id: commentId, hidden: !hidden });
      startTransition(() => router.refresh());
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not update comment");
    }
  }

  return (
    <>
      <div className="comment-actions">
        {canReply ? (
          <button type="button" onClick={() => setOpen((v) => !v)}>
            Reply
          </button>
        ) : null}
        {canModerate ? (
          <button type="button" onClick={toggleHidden} disabled={pending}>
            {hidden ? "Unhide" : "Hide"}
          </button>
        ) : null}
      </div>
      {open ? (
        <form onSubmit={reply} className="inline-form" style={{ marginTop: 6 }}>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write a reply…"
            aria-label="Reply"
          />
          <button className="btn" type="submit" disabled={pending}>
            Reply
          </button>
        </form>
      ) : null}
    </>
  );
}
