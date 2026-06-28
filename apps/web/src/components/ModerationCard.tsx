"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { clientGql } from "@/lib/clientGraphql";
import type { ManagedTopic } from "@/lib/feedTypes";
import { Avatar } from "./Avatar";

const MUTATION = `mutation Moderate($id: String!, $action: String!, $note: String) {
  moderateTopic(topicId: $id, action: $action, note: $note) { id status }
}`;

export function ModerationCard({ topic }: { topic: ManagedTopic }) {
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
      <div className="row" style={{ gap: 10, marginBottom: 8 }}>
        <Avatar name={topic.hostName} />
        <div>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{topic.hostName ?? "Host"}</div>
          <div className="faint" style={{ fontSize: 12 }}>submitted for review</div>
        </div>
      </div>
      <strong>{topic.title}</strong>
      {topic.coverImageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="topic-cover" src={topic.coverImageUrl} alt="" />
      )}
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
          Request changes
        </button>
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
