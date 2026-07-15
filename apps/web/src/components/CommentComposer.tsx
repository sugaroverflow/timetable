"use client";

import { Send } from "lucide-react";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { MentionTextarea, type MentionCandidate } from "@/components/MentionTextarea";
import { useToast } from "@/components/Toast";
import { clientGql } from "@/lib/clientGraphql";

const MUTATION = `mutation AddComment($id: String!, $body: String!, $visibility: String) {
  addComment(topicId: $id, body: $body, visibility: $visibility) { id }
}`;

const PEOPLE_QUERY = `query MentionPeople($s: String!) {
  timetablePeople(idOrSlug: $s) { name slug }
}`;

/** Comment box fixed to one visibility: the public, host-only, and
 * admin-only threads each get their own composer (QA #42/#59). Public
 * composers support @mention autocomplete when the timetable slug is known. */
export function CommentComposer({
  topicId,
  visibility = "public",
  hostLabel = "Host",
  adminLabel = "Admin",
  mentionSlug,
}: {
  topicId: string;
  visibility?: "public" | "host_only" | "admin_only";
  hostLabel?: string;
  adminLabel?: string;
  /** Timetable slug — enables @mention autocomplete on the public composer. */
  mentionSlug?: string;
}) {
  const router = useRouter();
  const { toast, toastError } = useToast();
  const [body, setBody] = useState("");
  const [pending, startTransition] = useTransition();
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

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const text = body.trim();
    if (!text) return;
    try {
      await clientGql(MUTATION, { id: topicId, body: text, visibility });
      setBody("");
      toast(scopeLabel ? `${scopeLabel} note added` : "Comment added");
      startTransition(() => router.refresh());
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Could not post comment");
    }
  }

  return (
    <form onSubmit={submit} className="inline-form" style={{ marginTop: 4 }}>
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
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={
            scopeLabel ? `Add a ${scopeLabel} note…` : "Add a comment…"
          }
          aria-label={scopeLabel ? `${scopeLabel} comment` : "Comment"}
          data-topic-composer={scopeLabel ? undefined : topicId}
        />
      )}
      <button
        className="btn btn-primary btn-send"
        type="submit"
        disabled={pending}
        aria-label={scopeLabel ? `Post ${scopeLabel} note` : "Post comment"}
        title="Post"
      >
        <Send size={16} aria-hidden />
      </button>
    </form>
  );
}
