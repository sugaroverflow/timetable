"use client";

import { MessageCircle } from "lucide-react";

export function FocusCommentButton({
  topicId,
  commentCount,
  onClick,
}: {
  topicId: string;
  commentCount: number;
  /** Override the default public-composer focus — the host-only thread
   * points this at its own composer (host hearts, 2026-08-04). */
  onClick?: () => void;
}) {
  return (
    <button
      className="act"
      type="button"
      onClick={
        onClick ??
        (() => {
          const ta = document.querySelector<HTMLTextAreaElement>(
            `[data-topic-composer="${topicId}"]`,
          );
          ta?.focus();
        })
      }
    >
      <MessageCircle size={16} aria-hidden />
      {commentCount || ""}
      <span style={{ fontWeight: "var(--fw-semibold)" }}>Comment</span>
    </button>
  );
}
