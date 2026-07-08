"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { useToast } from "@/components/Toast";
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
  const { toast, toastError } = useToast();
  const searchParams = useSearchParams();
  // Deep link from the notifications pane (QA #59 round 3): ?reply=<id>
  // opens and focuses this comment's reply composer.
  const deepLinked = canReply && searchParams.get("reply") === commentId;
  const [open, setOpen] = useState(deepLinked);
  const [body, setBody] = useState("");
  const [pending, startTransition] = useTransition();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!deepLinked) return;
    textareaRef.current?.focus();
    textareaRef.current?.scrollIntoView({ block: "center" });
  }, [deepLinked]);

  async function reply(e: React.FormEvent) {
    e.preventDefault();
    const text = body.trim();
    if (!text) return;
    try {
      await clientGql(REPLY, { id: commentId, body: text });
      setBody("");
      setOpen(false);
      toast("Reply posted");
      startTransition(() => router.refresh());
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Could not reply");
    }
  }

  async function toggleHidden() {
    try {
      await clientGql(HIDE, { id: commentId, hidden: !hidden });
      toast(hidden ? "Comment unhidden" : "Comment hidden");
      startTransition(() => router.refresh());
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Could not update comment");
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
            ref={textareaRef}
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
