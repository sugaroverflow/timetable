"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { useToast } from "@/components/Toast";
import { clientGql } from "@/lib/clientGraphql";

const MUTATION = `mutation AddComment($id: String!, $body: String!, $visibility: String) {
  addComment(topicId: $id, body: $body, visibility: $visibility) { id }
}`;

/** Comment box fixed to one visibility: the public thread and the host-only
 * thread each get their own composer (QA #42 — no "hosts only" checkbox). */
export function CommentComposer({
  topicId,
  visibility = "public",
}: {
  topicId: string;
  visibility?: "public" | "host_only";
}) {
  const router = useRouter();
  const { toast, toastError } = useToast();
  const [body, setBody] = useState("");
  const [pending, startTransition] = useTransition();
  const hostOnly = visibility === "host_only";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const text = body.trim();
    if (!text) return;
    try {
      await clientGql(MUTATION, { id: topicId, body: text, visibility });
      setBody("");
      toast(hostOnly ? "Host-only note added" : "Comment added");
      startTransition(() => router.refresh());
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Could not post comment");
    }
  }

  return (
    <form onSubmit={submit} className="inline-form" style={{ marginTop: 4 }}>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={hostOnly ? "Add a host-only note…" : "Add a comment…"}
        aria-label={hostOnly ? "Host-only comment" : "Comment"}
        data-topic-composer={hostOnly ? undefined : topicId}
      />
      <button className="btn btn-primary" type="submit" disabled={pending}>
        Post
      </button>
    </form>
  );
}
