"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Avatar } from "@/components/Avatar";
import { useToast } from "@/components/Toast";
import { TopicEditForm } from "@/components/TopicEditForm";
import { clientGql } from "@/lib/clientGraphql";
import type { ManagedTopic } from "@/lib/feedTypes";
import { topicPath } from "@/lib/topicPath";

const MUTATION = `mutation Moderate($id: String!, $action: String!, $note: String) {
  moderateTopic(topicId: $id, action: $action, note: $note) { id status }
}`;

export function ModerationCard({ topic, slug }: { topic: ManagedTopic; slug: string }) {
  const router = useRouter();
  const { toast, toastError } = useToast();
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState("");
  const [showNote, setShowNote] = useState(false);
  const [editing, setEditing] = useState(false);

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
      toast(
        action === "publish"
          ? "Topic published"
          : action === "reject"
            ? "Topic rejected"
            : "Feedback sent to host",
      );
      startTransition(() => router.refresh());
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Moderation failed");
    }
  }

  const permalink = topicPath(slug, topic.hostSlug ?? null, topic.slug ?? null);

  return (
    <li className="card stack">
      {/* Same header treatment as the feed card: avatar + title + author. */}
      <div className="row" style={{ alignItems: "flex-start" }}>
        <Avatar name={topic.hostName} />
        <div>
          <h3 className="topic-title">
            {permalink ? (
              <Link href={permalink} className="topic-title-link">
                {topic.title}
              </Link>
            ) : (
              topic.title
            )}
          </h3>
          <div className="faint" style={{ fontSize: 12 }}>
            by {topic.hostName ?? "Host"}
          </div>
        </div>
        <span style={{ flex: 1 }} />
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
      {topic.coverImageUrl ? (
        <div
          className="topic-cover"
          style={{ backgroundImage: `url(${topic.coverImageUrl})` }}
          aria-label={`${topic.title} cover image`}
        />
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
        <button
          className="btn"
          type="button"
          disabled={pending}
          onClick={() => setEditing((v) => !v)}
        >
          {editing ? "Cancel edit" : "Edit"}
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
      {editing ? (
        <TopicEditForm
          topic={topic}
          slug={slug}
          onDone={() => setEditing(false)}
        />
      ) : null}
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
