"use client";

import { useState } from "react";

import { ImageUploadField } from "@/components/ImageUploadField";
import { RichTextEditor } from "@/components/RichTextEditor";
import type { ManagedTopic } from "@/lib/feedTypes";
import { useGqlAction } from "@/lib/useGqlAction";

const UPDATE_MUTATION = `mutation Update($id: String!, $title: String!, $body: String!, $cover: String) {
  updateTopic(topicId: $id, title: $title, bodyMd: $body, coverImageUrl: $cover) { id }
}`;

/** Edit fields for a topic (title/body/cover) — used by the host's topic
 * manager and the admin moderation queue. Calls updateTopic and refreshes. */
export function TopicEditForm({
  topic,
  slug,
  onDone,
}: {
  topic: Pick<ManagedTopic, "id" | "title" | "bodyMd" | "coverImageUrl">;
  slug: string;
  onDone: () => void;
}) {
  const { run, busy } = useGqlAction();
  const [title, setTitle] = useState(topic.title);
  const [body, setBody] = useState(topic.bodyMd);
  const [cover, setCover] = useState(topic.coverImageUrl ?? "");
  const [uploadingCover, setUploadingCover] = useState(false);

  function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    void run(
      UPDATE_MUTATION,
      {
        id: topic.id,
        title: title.trim(),
        body,
        cover: cover.trim() || null,
      },
      {
        success: "Topic updated",
        errorFallback: "Could not save changes",
        onSuccess: onDone,
      },
    );
  }

  return (
    <form className="stack" onSubmit={saveEdit}>
      <div className="field">
        <label htmlFor={`topic-edit-title-${topic.id}`}>Title</label>
        <input
          id={`topic-edit-title-${topic.id}`}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>
      <ImageUploadField
        id={`topic-edit-cover-${topic.id}`}
        label="Cover image"
        value={cover}
        onChange={setCover}
        purpose="topic-cover"
        timetableIdOrSlug={slug}
        onUploadingChange={setUploadingCover}
      />
      <div className="field">
        <label htmlFor={`topic-edit-body-${topic.id}`}>Description</label>
        <RichTextEditor value={body} onChange={setBody} minHeight={280} />
      </div>
      <div className="row">
        <button
          className="btn btn-primary"
          type="submit"
          disabled={busy || uploadingCover}
        >
          {uploadingCover ? "Uploading…" : busy ? "Saving…" : "Save changes"}
        </button>
        <button className="btn btn-ghost" type="button" onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  );
}
