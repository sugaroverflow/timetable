"use client";

import { useState } from "react";

import { DraftRestoredNotice } from "@/components/DraftRestoredNotice";
import { ImageUploadField } from "@/components/ImageUploadField";
import { RichTextEditor } from "@/components/RichTextEditor";
import type { ManagedTopic } from "@/lib/feedTypes";
import { useStoredDraft } from "@/lib/formDrafts";
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
  // Unsaved EDITS are recoverable the same way a new topic's text is
  // (topic-draft-recovery, Ed 2026-08-21) — the baseline is the saved
  // content, so an untouched editor stores nothing.
  const { values, patch, restored, discard } = useStoredDraft(
    `topic:${topic.id}`,
    {
      title: topic.title,
      body: topic.bodyMd,
      cover: topic.coverImageUrl ?? "",
    },
  );
  const { title, body, cover } = values;
  const [uploadingCover, setUploadingCover] = useState(false);

  /** Saved or cancelled: either way these edits are no longer pending. */
  function done() {
    discard();
    onDone();
  }

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
        onSuccess: done,
      },
    );
  }

  return (
    <form className="stack" onSubmit={saveEdit}>
      {restored ? <DraftRestoredNotice onDiscard={discard} /> : null}
      <div className="field">
        <label htmlFor={`topic-edit-title-${topic.id}`}>Title</label>
        <input
          id={`topic-edit-title-${topic.id}`}
          value={title}
          onChange={(e) => patch({ title: e.target.value })}
        />
      </div>
      <ImageUploadField
        id={`topic-edit-cover-${topic.id}`}
        label="Cover image"
        value={cover}
        onChange={(next) => patch({ cover: next })}
        purpose="topic-cover"
        timetableIdOrSlug={slug}
        onUploadingChange={setUploadingCover}
      />
      <div className="field">
        <label htmlFor={`topic-edit-body-${topic.id}`}>Description</label>
        <RichTextEditor
          value={body}
          onChange={(next) => patch({ body: next })}
          minHeight={280}
        />
      </div>
      <div className="row">
        <button
          className="btn btn-primary"
          type="submit"
          disabled={busy || uploadingCover}
        >
          {uploadingCover ? "Uploading…" : busy ? "Saving…" : "Save changes"}
        </button>
        <button className="btn btn-ghost" type="button" onClick={done}>
          Cancel
        </button>
      </div>
    </form>
  );
}
