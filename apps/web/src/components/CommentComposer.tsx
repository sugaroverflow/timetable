"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { clientGql } from "@/lib/clientGraphql";

const MUTATION = `mutation AddComment($id: String!, $body: String!, $visibility: String) {
  addComment(topicId: $id, body: $body, visibility: $visibility) { id }
}`;

export function CommentComposer({
  topicId,
  canHostOnly,
}: {
  topicId: string;
  canHostOnly: boolean;
}) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [hostOnly, setHostOnly] = useState(false);
  const [pending, startTransition] = useTransition();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const text = body.trim();
    if (!text) return;
    try {
      await clientGql(MUTATION, {
        id: topicId,
        body: text,
        visibility: hostOnly ? "host_only" : "public",
      });
      setBody("");
      startTransition(() => router.refresh());
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not post comment");
    }
  }

  return (
    <form onSubmit={submit} className="inline-form" style={{ marginTop: 4 }}>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={hostOnly ? "Add a host-only note…" : "Add a comment…"}
        aria-label="Comment"
        data-topic-composer={topicId}
      />
      <div className="stack" style={{ gap: 6 }}>
        <button className="btn btn-primary" type="submit" disabled={pending}>
          Post
        </button>
        {canHostOnly ? (
          <label
            className="faint"
            style={{ fontSize: 11, display: "flex", gap: 4, alignItems: "center" }}
          >
            <input
              type="checkbox"
              checked={hostOnly}
              onChange={(e) => setHostOnly(e.target.checked)}
              style={{ width: "auto" }}
            />
            Hosts only
          </label>
        ) : null}
      </div>
    </form>
  );
}
