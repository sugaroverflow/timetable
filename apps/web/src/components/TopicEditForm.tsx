"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import { DraftRestoredNotice } from "@/components/DraftRestoredNotice";
import { ImageUploadField } from "@/components/ImageUploadField";
import { RichTextEditor } from "@/components/RichTextEditor";
import type { ManagedTopic } from "@/lib/feedTypes";
import { useStoredDraft } from "@/lib/formDrafts";
import { topicPath } from "@/lib/topicPath";
import { useGqlAction } from "@/lib/useGqlAction";

const UPDATE_MUTATION = `mutation Update($id: String!, $title: String!, $body: String!, $cover: String) {
  updateTopic(topicId: $id, title: $title, bodyMd: $body, coverImageUrl: $cover) { id slug hostSlug }
}`;

type Updated = {
  updateTopic: { id: string; slug: string | null; hostSlug: string | null };
};

/** Edit fields for a topic (title/body/cover) — used by the host's topic
 * manager and the admin moderation queue. Calls updateTopic and refreshes —
 * unless the save moved the page: a draft's slug follows its title
 * (core `updateTopic`), so renaming from its own permalink changes the
 * URL underfoot, and refreshing the old one 404s (Ed, 2026-09-03). Then
 * we navigate to the new permalink instead. */
export function TopicEditForm({
  topic,
  slug,
  onDone,
}: {
  topic: Pick<
    ManagedTopic,
    "id" | "title" | "bodyMd" | "coverImageUrl" | "slug"
  >;
  slug: string;
  onDone: () => void;
}) {
  const { run, busy } = useGqlAction();
  const router = useRouter();
  const pathname = usePathname();
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

  /** The new permalink when the save renamed the topic's URL and that URL
   * is the page we're on; null otherwise (refresh is right). */
  function movedTo({ updateTopic: saved }: Updated): string | null {
    const before = topicPath(slug, saved.hostSlug, topic.slug);
    const after = topicPath(slug, saved.hostSlug, saved.slug);
    return before && after && before !== after && pathname === before
      ? after
      : null;
  }

  function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    void run<Updated>(
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
        onSuccess: (data) => {
          const next = movedTo(data);
          if (!next) return done();
          // The page is about to be replaced by the fresh render at the
          // new URL; leave the form up rather than flash the stale card.
          discard();
          router.replace(next);
        },
        refresh: (data) => movedTo(data) === null,
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
