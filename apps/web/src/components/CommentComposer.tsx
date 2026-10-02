"use client";

import { Send } from "lucide-react";

import { ComposerRow } from "@/components/ComposerRow";
import { GrowingTextarea } from "@/components/GrowingTextarea";
import { ForumMentionTextarea } from "@/components/MentionTextarea";
import { draftKey, useDraft } from "@/lib/commentDrafts";
import { SUBMIT_SHORTCUT_ARIA } from "@/lib/submitShortcut";
import { useGqlAction } from "@/lib/useGqlAction";

import { useCommentsOpen } from "./CommentsOpenScope";

const MUTATION = `mutation AddComment($id: String!, $body: String!, $visibility: String) {
  addComment(topicId: $id, body: $body, visibility: $visibility) { id }
}`;

/** Placeholder + success toast: explicit overrides win, else derived from
 * the composer's visibility scope. */
function composerCopy(
  scopeLabel: string | null,
  overrides: { placeholder?: string; successMessage?: string },
) {
  return {
    placeholder:
      overrides.placeholder ??
      (scopeLabel ? `Add a ${scopeLabel} note…` : "Add a comment…"),
    /** The @mention-capable public box says so; an override still wins. */
    mentionPlaceholder:
      overrides.placeholder ?? "Add a comment… (@ to mention)",
    success:
      overrides.successMessage ??
      (scopeLabel ? `${scopeLabel} note added` : "Comment added"),
  };
}

/** `submitOnEnter`'s key handling: Enter posts, Shift+Enter (or any
 * modifier) starts a line, Escape blurs so the Topic Queue's arrows work
 * again. On the mention path the picker sees the key first and keeps
 * Enter for itself while it's open. */
function enterToPost(post: () => void) {
  return (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Escape") {
      e.currentTarget.blur();
      return;
    }
    if (e.key !== "Enter" || e.shiftKey || e.metaKey || e.ctrlKey || e.altKey) {
      return;
    }
    e.preventDefault();
    post();
  };
}

/** Comment box fixed to one visibility: the public, host-only, and
 * admin-only threads each get their own composer (QA #42/#59). Public
 * composers support @mention autocomplete when the timetable slug is known. */
export function CommentComposer({
  topicId,
  visibility = "public",
  hostLabel = "Host",
  adminLabel = "Admin",
  mentionSlug,
  placeholder,
  successMessage,
  submitOnEnter,
}: {
  topicId: string;
  visibility?: "public" | "host_only" | "admin_only";
  hostLabel?: string;
  adminLabel?: string;
  /** Timetable slug — enables @mention autocomplete on the public composer. */
  mentionSlug?: string;
  /** Override the scope-derived placeholder (the drafting thread explains
   * its audience instead — QA 2026-07-29). */
  placeholder?: string;
  /** Override the scope-derived success toast. */
  successMessage?: string;
  /** queue-keys (2026-09-07): make the box a keyboard stop — Enter posts,
   * Shift+Enter starts a line, Escape blurs so the Topic Queue's arrows
   * work again. Off everywhere else: on a feed card the composer is one
   * of many, and Enter-to-post costs you a half-written paragraph. */
  submitOnEnter?: boolean;
}) {
  const { run, busy } = useGqlAction();
  // Posting unfolds the card's comment-teaser so the new comment is
  // visible in its thread (QA 2026-08-13); no-op without a teaser.
  const { requestOpen } = useCommentsOpen();
  const [body, setBody, clearBody] = useDraft(
    draftKey.comment(topicId, visibility),
  );
  const scopeLabel =
    visibility === "host_only"
      ? `${hostLabel}-only`
      : visibility === "admin_only"
        ? adminLabel
        : null;
  const copy = composerCopy(scopeLabel, { placeholder, successMessage });

  function post() {
    const text = body.trim();
    if (!text) return;
    void run(
      MUTATION,
      { id: topicId, body: text, visibility },
      {
        success: copy.success,
        errorFallback: "Could not post comment",
        onSuccess: () => {
          clearBody();
          requestOpen();
          // queue-keys: once Enter has posted, the box gives the arrows
          // back by itself — the round continues with → rather than an
          // Escape first (adopted from #346, 2026-09-10).
          if (submitOnEnter && document.activeElement instanceof HTMLElement) {
            document.activeElement.blur();
          }
        },
      },
    );
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    post();
  }

  const keyHandler = submitOnEnter ? enterToPost(post) : undefined;

  return (
    // No own margin — the surrounding stack/thread-stack gap spaces it
    // (card spacing spec, 2026-08-05). The viewer's avatar sits left so
    // the composer aligns with posted comments (QA 2026-08-10).
    <ComposerRow>
      <form onSubmit={submit} className="inline-form">
        {visibility === "public" && mentionSlug ? (
          <ForumMentionTextarea
            mentionSlug={mentionSlug}
            value={body}
            onChange={setBody}
            placeholder={copy.mentionPlaceholder}
            ariaLabel="Comment"
            dataTopicComposer={topicId}
            onUnhandledKeyDown={keyHandler}
          />
        ) : (
          <GrowingTextarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={copy.placeholder}
            aria-label={scopeLabel ? `${scopeLabel} comment` : "Comment"}
            data-topic-composer={scopeLabel ? undefined : topicId}
            onKeyDown={keyHandler}
          />
        )}
        <button
          className="btn btn-primary btn-send"
          aria-keyshortcuts={SUBMIT_SHORTCUT_ARIA}
          type="submit"
          disabled={busy}
          aria-label={scopeLabel ? `Post ${scopeLabel} note` : "Post comment"}
          title="Post"
        >
          <Send size={16} aria-hidden />
        </button>
      </form>
    </ComposerRow>
  );
}
