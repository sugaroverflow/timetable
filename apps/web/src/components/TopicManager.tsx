"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { ImageUploadField } from "@/components/ImageUploadField";
import { clientGql } from "@/lib/clientGraphql";
import type { ManagedTopic } from "@/lib/feedTypes";

const SUBMIT = `mutation($id: String!){ submitTopic(topicId: $id){ id } }`;
const UNPUBLISH = `mutation($id: String!){ unpublishTopic(topicId: $id){ id } }`;
const UPDATE = `mutation($id: String!, $title: String!, $body: String!, $cover: String){
  updateTopic(topicId: $id, title: $title, bodyMd: $body, coverImageUrl: $cover){ id }
}`;

export function TopicManager({
  topic,
  slug,
}: {
  topic: ManagedTopic;
  slug: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(topic.title);
  const [body, setBody] = useState(topic.bodyMd);
  const [cover, setCover] = useState(topic.coverImageUrl ?? "");
  const [uploadingCover, setUploadingCover] = useState(false);

  async function run(query: string, variables: Record<string, unknown>) {
    try {
      await clientGql(query, variables);
      startTransition(() => router.refresh());
    } catch (err) {
      alert(err instanceof Error ? err.message : "Action failed");
    }
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    await run(UPDATE, {
      id: topic.id,
      title: title.trim(),
      body,
      cover: cover.trim() || null,
    });
    setEditing(false);
  }

  return (
    <li className="card">
      <div className="row wrap" style={{ justifyContent: "space-between" }}>
        <strong>{topic.title}</strong>
        <span className={`status-badge status-${topic.status}`}>
          {topic.status}
        </span>
      </div>

      {topic.feedback ? (
        <p className="notice" style={{ marginTop: 10 }}>
          <strong>Admin feedback:</strong> {topic.feedback}
        </p>
      ) : null}

      {editing ? (
        <form onSubmit={saveEdit} className="stack" style={{ marginTop: 10 }}>
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
          <textarea value={body} onChange={(e) => setBody(e.target.value)} />
          <ImageUploadField
            id={`topic-cover-${topic.id}`}
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
              {uploadingCover ? "Uploading…" : "Save"}
            </button>
            <button
              className="btn btn-ghost"
              type="button"
              onClick={() => setEditing(false)}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="row wrap" style={{ marginTop: 10 }}>
          {(topic.status === "draft" || topic.status === "unpublished") && (
            <button
              className="btn btn-primary"
              type="button"
              disabled={pending}
              onClick={() => run(SUBMIT, { id: topic.id })}
            >
              Submit for review
            </button>
          )}
          {topic.status === "published" && (
            <button
              className="btn"
              type="button"
              disabled={pending}
              onClick={() => run(UNPUBLISH, { id: topic.id })}
            >
              Unpublish
            </button>
          )}
          {topic.status === "submitted" && (
            <span className="faint" style={{ fontSize: 13 }}>
              In the moderation queue…
            </span>
          )}
          <button
            className="btn btn-ghost"
            type="button"
            onClick={() => setEditing(true)}
          >
            Edit
          </button>
        </div>
      )}
    </li>
  );
}
