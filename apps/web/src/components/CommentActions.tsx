"use client";

import { Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

import { useGqlAction } from "@/lib/useGqlAction";

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
  const { run, busy } = useGqlAction();
  const searchParams = useSearchParams();
  // Deep link from the notifications pane (QA #59 round 3): ?reply=<id>
  // opens and focuses this comment's reply composer.
  const deepLinked = canReply && searchParams.get("reply") === commentId;
  const [open, setOpen] = useState(deepLinked);
  const [body, setBody] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!deepLinked) return;
    textareaRef.current?.focus();
    textareaRef.current?.scrollIntoView({ block: "center" });
  }, [deepLinked]);

  function reply(e: React.FormEvent) {
    e.preventDefault();
    const text = body.trim();
    if (!text) return;
    void run(
      REPLY,
      { id: commentId, body: text },
      {
        success: "Reply posted",
        errorFallback: "Could not reply",
        onSuccess: () => {
          setBody("");
          setOpen(false);
        },
      },
    );
  }

  function toggleHidden() {
    void run(
      HIDE,
      { id: commentId, hidden: !hidden },
      {
        success: hidden ? "Comment unhidden" : "Comment hidden",
        errorFallback: "Could not update comment",
      },
    );
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
          <button type="button" onClick={toggleHidden} disabled={busy}>
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
          <button
            className="btn btn-primary btn-send"
            type="submit"
            disabled={busy}
            aria-label="Post reply"
            title="Reply"
          >
            <Send size={16} aria-hidden />
          </button>
        </form>
      ) : null}
    </>
  );
}
