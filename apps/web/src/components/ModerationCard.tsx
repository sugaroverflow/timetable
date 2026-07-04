"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { ImageUploadField } from "@/components/ImageUploadField";
import { useToast } from "@/components/Toast";
import { clientGql } from "@/lib/clientGraphql";
import type { ManagedTopic } from "@/lib/feedTypes";

const MUTATION = `mutation Moderate($id: String!, $action: String!, $note: String) {
  moderateTopic(topicId: $id, action: $action, note: $note) { id status }
}`;

const UPDATE_MUTATION = `mutation Update($id: String!, $title: String, $body: String, $cover: String) {
  updateTopic(topicId: $id, title: $title, bodyMd: $body, coverImageUrl: $cover) { id }
}`;

export function ModerationCard({ topic, slug }: { topic: ManagedTopic; slug: string }) {
  const router = useRouter();
  const { toast, toastError } = useToast();
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState("");
  const [showNote, setShowNote] = useState(false);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(topic.title);
  const [body, setBody] = useState(topic.bodyMd);
  const [cover, setCover] = useState(topic.coverImageUrl ?? "");
  const [uploadingCover, setUploadingCover] = useState(false);

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

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    try {
      await clientGql(UPDATE_MUTATION, {
        id: topic.id,
        title: title.trim(),
        body,
        cover: cover.trim() || null,
      });
      setEditing(false);
      toast("Topic updated");
      startTransition(() => router.refresh());
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Could not save changes");
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
        <form className="stack" onSubmit={saveEdit}>
          <div className="field">
            <label htmlFor={`mod-edit-title-${topic.id}`}>Title</label>
            <input
              id={`mod-edit-title-${topic.id}`}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor={`mod-edit-body-${topic.id}`}>
              Description (markdown)
            </label>
            <textarea
              id={`mod-edit-body-${topic.id}`}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </div>
          <ImageUploadField
            id={`mod-edit-cover-${topic.id}`}
            label="Cover image URL"
            value={cover}
            onChange={setCover}
            purpose="topic-cover"
            timetableIdOrSlug={slug}
            onUploadingChange={setUploadingCover}
          />
          <div className="row">
            <button
              className="btn btn-primary"
              type="submit"
              disabled={pending || uploadingCover}
            >
              {uploadingCover ? "Uploading…" : pending ? "Saving…" : "Save changes"}
            </button>
          </div>
        </form>
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
