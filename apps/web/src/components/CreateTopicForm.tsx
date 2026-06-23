"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { clientGql } from "@/lib/clientGraphql";

const MUTATION = `mutation Create($s: String!, $title: String!, $body: String, $cover: String) {
  createTopic(idOrSlug: $s, title: $title, bodyMd: $body, coverImageUrl: $cover) { id }
}`;

export function CreateTopicForm({ slug }: { slug: string }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [cover, setCover] = useState("");
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
      startTransition(() => router.refresh());
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not create topic");
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
      <div className="field">
        <label htmlFor="topic-body">Description (markdown)</label>
        <textarea
          id="topic-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="What is this session about?"
        />
      </div>
      <div className="field">
        <label htmlFor="topic-cover">Cover image URL</label>
        <input
          id="topic-cover"
          value={cover}
          onChange={(e) => setCover(e.target.value)}
          placeholder="https://…"
        />
      </div>
      <button className="btn btn-primary" type="submit" disabled={pending}>
        {pending ? "Creating…" : "Create draft"}
      </button>
    </form>
  );
}
