"use client";

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
      <span className="ic">💬</span>
      {commentCount || ""}
      <span style={{ fontWeight: 600 }}>Comment</span>
    </button>
  );
}
