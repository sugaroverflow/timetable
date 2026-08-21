"use client";

import { useState } from "react";

import { DraftRestoredNotice } from "@/components/DraftRestoredNotice";
import { ImageUploadField } from "@/components/ImageUploadField";
import { RichTextEditor } from "@/components/RichTextEditor";
import { useStoredDraft } from "@/lib/formDrafts";
import { useGqlAction } from "@/lib/useGqlAction";

const MUTATION = `mutation Create($s: String!, $title: String!, $body: String, $cover: String, $host: String) {
  createTopic(idOrSlug: $s, title: $title, bodyMd: $body, coverImageUrl: $cover, hostId: $host) { id }
}`;

export function CreateTopicForm({
  slug,
  hosts,
  hostLabel = "Host",
}: {
  slug: string;
  /** Admin-only (round 2): other hosts this topic can be created for. */
  hosts?: { id: string; name: string | null }[];
  hostLabel?: string;
}) {
  const { run, busy } = useGqlAction();
  // A topic is long-form writing: keep it recoverable if the page goes
  // away under it (topic-draft-recovery, Ed 2026-08-21). One draft per
  // forum, so two forums' new topics don't overwrite each other.
  const { values, patch, restored, discard } = useStoredDraft(
    `new-topic:${slug}`,
    { title: "", body: "", cover: "", host: "" },
  );
  const { title, body, cover, host } = values;
  const [uploadingCover, setUploadingCover] = useState(false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    const owner = hosts?.find((h) => h.id === host)?.name;
    void run(
      MUTATION,
      {
        s: slug,
        title: title.trim(),
        body,
        cover: cover.trim() || null,
        host: host || null,
      },
      {
        success: owner ? `Topic created for ${owner}` : "Topic created",
        errorFallback: "Could not create topic",
        // The topic exists now — the draft has done its job.
        onSuccess: discard,
      },
    );
  }

  return (
    <form onSubmit={submit} className="card">
      <h2 className="section-title" style={{ marginBottom: 10 }}>
        New topic
      </h2>
      {restored ? <DraftRestoredNotice onDiscard={discard} /> : null}
      <div className="field">
        <label htmlFor="topic-title">Title</label>
        <input
          id="topic-title"
          value={title}
          onChange={(e) => patch({ title: e.target.value })}
          placeholder="Cryptocurrencies"
        />
      </div>
      <ImageUploadField
        id="topic-cover"
        label="Cover image"
        value={cover}
        onChange={(next) => patch({ cover: next })}
        purpose="topic-cover"
        timetableIdOrSlug={slug}
        onUploadingChange={setUploadingCover}
      />
      <div className="field" style={{ marginTop: 12 }}>
        <label htmlFor="topic-body">Description</label>
        <RichTextEditor
          value={body}
          onChange={(next) => patch({ body: next })}
          placeholder="What is this session about?"
        />
      </div>
      {hosts && hosts.length > 0 ? (
        <div className="field">
          <label htmlFor="topic-host">{hostLabel}</label>
          <select
            id="topic-host"
            value={host}
            onChange={(e) => patch({ host: e.target.value })}
          >
            <option value="">Me</option>
            {hosts.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name ?? "Member"}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      <button
        className="btn btn-primary"
        type="submit"
        disabled={busy || uploadingCover}
      >
        {uploadingCover ? "Uploading…" : busy ? "Creating…" : "Create topic"}
      </button>
    </form>
  );
}
