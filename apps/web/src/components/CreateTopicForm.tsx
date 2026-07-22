"use client";

import { useState } from "react";

import { ImageUploadField } from "@/components/ImageUploadField";
import { RichTextEditor } from "@/components/RichTextEditor";
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
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [cover, setCover] = useState("");
  const [host, setHost] = useState("");
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
        onSuccess: () => {
          setTitle("");
          setBody("");
          setCover("");
          setHost("");
        },
      },
    );
  }

  return (
    <form onSubmit={submit} className="card">
      <h2 style={{ marginTop: 0, fontSize: 18 }}>New topic</h2>
      <div className="field">
        <label htmlFor="topic-title">Title</label>
        <input
          id="topic-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Cryptocurrencies"
        />
      </div>
      <ImageUploadField
        id="topic-cover"
        label="Cover image"
        value={cover}
        onChange={setCover}
        purpose="topic-cover"
        timetableIdOrSlug={slug}
        onUploadingChange={setUploadingCover}
      />
      <div className="field" style={{ marginTop: 12 }}>
        <label htmlFor="topic-body">Description</label>
        <RichTextEditor
          value={body}
          onChange={setBody}
          placeholder="What is this session about?"
        />
      </div>
      {hosts && hosts.length > 0 ? (
        <div className="field">
          <label htmlFor="topic-host">{hostLabel}</label>
          <select
            id="topic-host"
            value={host}
            onChange={(e) => setHost(e.target.value)}
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
