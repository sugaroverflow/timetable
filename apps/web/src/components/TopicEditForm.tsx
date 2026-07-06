"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { ImageUploadField } from "@/components/ImageUploadField";
import { useToast } from "@/components/Toast";
import { clientGql } from "@/lib/clientGraphql";
import type { ManagedTopic } from "@/lib/feedTypes";

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
  const router = useRouter();
  const { toast, toastError } = useToast();
  const [pending, startTransition] = useTransition();
  const [title, setTitle] = useState(topic.title);
  const [body, setBody] = useState(topic.bodyMd);
  const [cover, setCover] = useState(topic.coverImageUrl ?? "");
  const [uploadingCover, setUploadingCover] = useState(false);

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
      onDone();
      toast("Topic updated");
      startTransition(() => router.refresh());
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Could not save changes");
    }
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
      <div className="field">
        <label htmlFor={`topic-edit-body-${topic.id}`}>
          Description (markdown)
        </label>
        <textarea
          id={`topic-edit-body-${topic.id}`}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
      </div>
      <ImageUploadField
        id={`topic-edit-cover-${topic.id}`}
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
        <button className="btn btn-ghost" type="button" onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  );
}
