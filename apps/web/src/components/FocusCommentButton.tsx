"use client";

import { MessageCircle } from "lucide-react";

export function FocusCommentButton({
  topicId,
  commentCount,
}: {
  topicId: string;
  commentCount: number;
}) {
  return (
    <button
      className="act"
      type="button"
      onClick={() => {
        const ta = document.querySelector<HTMLTextAreaElement>(
          `[data-topic-composer="${topicId}"]`,
        );
        ta?.focus();
      }}
    >
      <MessageCircle size={16} aria-hidden />
      {commentCount || ""}
      <span style={{ fontWeight: "var(--fw-semibold)" }}>Comment</span>
    </button>
  );
}
