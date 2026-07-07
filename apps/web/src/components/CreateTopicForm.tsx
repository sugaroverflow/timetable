"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { ImageUploadField } from "@/components/ImageUploadField";
import { RichTextEditor } from "@/components/RichTextEditor";
import { useToast } from "@/components/Toast";
import { clientGql } from "@/lib/clientGraphql";

const MUTATION = `mutation Create($s: String!, $title: String!, $body: String, $cover: String) {
  createTopic(idOrSlug: $s, title: $title, bodyMd: $body, coverImageUrl: $cover) { id }
}`;

export function CreateTopicForm({ slug }: { slug: string }) {
  const router = useRouter();
  const { toast, toastError } = useToast();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [cover, setCover] = useState("");
  const [uploadingCover, setUploadingCover] = useState(false);
  const [pending, startTransition] = useTransition();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    try {
      await clientGql(MUTATION, {
        s: slug,
        title: title.trim(),
        body,
        cover: cover.trim() || null,
      });
      setTitle("");
      setBody("");
      setCover("");
      toast("Draft created");
      startTransition(() => router.refresh());
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Could not create topic");
    }
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
      <button
        className="btn btn-primary"
        type="submit"
        disabled={pending || uploadingCover}
      >
        {uploadingCover ? "Uploading…" : pending ? "Creating…" : "Create draft"}
      </button>
    </form>
  );
}
