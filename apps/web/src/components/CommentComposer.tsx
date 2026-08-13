"use client";

import { Send } from "lucide-react";
import { useState } from "react";

import { ComposerRow } from "@/components/ComposerRow";
import { GrowingTextarea } from "@/components/GrowingTextarea";
import {
  MentionTextarea,
  type MentionCandidate,
} from "@/components/MentionTextarea";
import { clientGql } from "@/lib/clientGraphql";
import { useGqlAction } from "@/lib/useGqlAction";

import { useCommentsOpen } from "./CommentsOpenScope";

const MUTATION = `mutation AddComment($id: String!, $body: String!, $visibility: String) {
  addComment(topicId: $id, body: $body, visibility: $visibility) { id }
}`;

const PEOPLE_QUERY = `query MentionPeople($s: String!) {
  timetablePeople: forumPeople(idOrSlug: $s) { name slug }
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
    success:
      overrides.successMessage ??
      (scopeLabel ? `${scopeLabel} note added` : "Comment added"),
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
}) {
  const { run, busy } = useGqlAction();
  // Posting unfolds the card's comment-teaser so the new comment is
  // visible in its thread (QA 2026-08-13); no-op without a teaser.
  const { requestOpen } = useCommentsOpen();
  const [body, setBody] = useState("");
  const mentionsEnabled = visibility === "public" && Boolean(mentionSlug);
  const [candidates, setCandidates] = useState<MentionCandidate[]>([]);
  const [loadedCandidates, setLoadedCandidates] = useState(false);

  async function loadCandidates() {
    if (loadedCandidates || !mentionSlug) return;
    setLoadedCandidates(true);
    try {
      const data = await clientGql<{ timetablePeople: MentionCandidate[] }>(
        PEOPLE_QUERY,
        { s: mentionSlug },
      );
      setCandidates(data.timetablePeople ?? []);
    } catch {
      // Autocomplete is a convenience; a hand-typed @slug still resolves.
    }
  }
  const scopeLabel =
    visibility === "host_only"
      ? `${hostLabel}-only`
      : visibility === "admin_only"
        ? adminLabel
        : null;
  const copy = composerCopy(scopeLabel, { placeholder, successMessage });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const text = body.trim();
    if (!text) return;
    void run(
      MUTATION,
      { id: topicId, body: text, visibility },
      {
        success: copy.success,
        errorFallback: "Could not post comment",
        onSuccess: () => {
          setBody("");
          requestOpen();
        },
      },
    );
  }

  return (
    // No own margin — the surrounding stack/thread-stack gap spaces it
    // (card spacing spec, 2026-08-05). The viewer's avatar sits left so
    // the composer aligns with posted comments (QA 2026-08-10).
    <ComposerRow>
      <form onSubmit={submit} className="inline-form">
        {mentionsEnabled ? (
          <div style={{ flex: 1 }} onFocus={loadCandidates}>
            <MentionTextarea
              value={body}
              onChange={setBody}
              candidates={candidates}
              placeholder="Add a comment… (@ to mention)"
              ariaLabel="Comment"
              dataTopicComposer={topicId}
            />
          </div>
        ) : (
          <GrowingTextarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={copy.placeholder}
            aria-label={scopeLabel ? `${scopeLabel} comment` : "Comment"}
            data-topic-composer={scopeLabel ? undefined : topicId}
          />
        )}
        <button
          className="btn btn-primary btn-send"
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
