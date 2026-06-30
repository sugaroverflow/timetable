"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { clientGql } from "@/lib/clientGraphql";
import type { ManagedTopic } from "@/lib/feedTypes";

const MUTATION = `mutation Moderate($id: String!, $action: String!, $note: String) {
  moderateTopic(topicId: $id, action: $action, note: $note) { id status }
}`;

export function ModerationCard({ topic, slug }: { topic: ManagedTopic; slug: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState("");
  const [showNote, setShowNote] = useState(false);

  async function act(action: "publish" | "reject" | "request_changes") {
    if (action === "request_changes" && !note.trim()) {
      setShowNote(true);
      return;
    }
    try {
      await clientGql(MUTATION, {
        id: topic.id,
        action,
        note: action === "request_changes" ? note.trim() : null,
      });
      setNote("");
      setShowNote(false);
      startTransition(() => router.refresh());
    } catch (err) {
      alert(err instanceof Error ? err.message : "Moderation failed");
    }
  }

  return (
    <li className="card stack">
      <div className="row wrap" style={{ justifyContent: "space-between" }}>
        <strong>{topic.title}</strong>
        {topic.feedback && (
          <span className="status-badge status-submitted">submitted</span>
        )}
      </div>
      {topic.feedback ? (
        <div className="mod-feedback-box">
          <div className="mfb-head">↩ Changes requested</div>
          <div>Admin feedback: &ldquo;{topic.feedback}&rdquo;</div>
        </div>
      ) : null}
      <div
        className="topic-body"
        dangerouslySetInnerHTML={{ __html: topic.bodyHtml }}
      />
      <div className="row wrap">
        <button
          className="btn btn-primary"
          type="button"
          disabled={pending}
          onClick={() => act("publish")}
        >
          Publish
        </button>
        <button
          className="btn"
          type="button"
          disabled={pending}
          onClick={() => setShowNote((v) => !v)}
        >
          {topic.feedback ? "Update feedback" : "Request changes"}
        </button>
        <a href={`/t/${slug}/topics`} className="btn">Edit</a>
        <button
          className="btn btn-ghost"
          type="button"
          disabled={pending}
          onClick={() => act("reject")}
        >
          Reject
        </button>
      </div>
      {showNote ? (
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            act("request_changes");
          }}
        >
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What should the host change?"
            aria-label="Feedback"
          />
          <button className="btn btn-primary" type="submit" disabled={pending}>
            Send
          </button>
        </form>
      ) : null}
    </li>
  );
}
