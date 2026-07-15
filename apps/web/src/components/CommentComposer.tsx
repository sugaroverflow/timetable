"use client";

import { Send } from "lucide-react";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { useToast } from "@/components/Toast";
import { clientGql } from "@/lib/clientGraphql";

const MUTATION = `mutation AddComment($id: String!, $body: String!, $visibility: String) {
  addComment(topicId: $id, body: $body, visibility: $visibility) { id }
}`;

/** Comment box fixed to one visibility: the public, host-only, and
 * admin-only threads each get their own composer (QA #42/#59). */
export function CommentComposer({
  topicId,
  visibility = "public",
  hostLabel = "Host",
  adminLabel = "Admin",
}: {
  topicId: string;
  visibility?: "public" | "host_only" | "admin_only";
  hostLabel?: string;
  adminLabel?: string;
}) {
  const router = useRouter();
  const { toast, toastError } = useToast();
  const [body, setBody] = useState("");
  const [pending, startTransition] = useTransition();
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
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={
          scopeLabel ? `Add a ${scopeLabel} note…` : "Add a comment…"
        }
        aria-label={scopeLabel ? `${scopeLabel} comment` : "Comment"}
        data-topic-composer={scopeLabel ? undefined : topicId}
      />
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
