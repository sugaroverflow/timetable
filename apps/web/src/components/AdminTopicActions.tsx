"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { useToast } from "@/components/Toast";
import { clientGql } from "@/lib/clientGraphql";

import { TopicEditForm } from "./TopicEditForm";

const UNPUBLISH = `mutation($id: String!){ unpublishTopic(topicId: $id){ id } }`;
const PUBLISH = `mutation($id: String!){ moderateTopic(topicId: $id, action: "publish"){ id } }`;
const REASSIGN = `mutation($id: String!, $host: String!){ reassignTopic(topicId: $id, hostId: $host){ id } }`;

export function AdminTopicActions({
  topic,
  slug,
  label = "Admin",
  hosts = [],
  currentHostId,
}: {
  topic: {
    id: string;
    title: string;
    bodyMd: string;
    coverImageUrl: string | null;
    status?: string;
  };
  slug: string;
  label?: string;
  hosts?: { id: string; name: string | null }[];
  currentHostId?: string;
}) {
  const topicId = topic.id;
  const router = useRouter();
  const { toast, toastError } = useToast();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [newHost, setNewHost] = useState("");

  const published = topic.status == null || topic.status === "published";

  async function togglePublished() {
    try {
      await clientGql(published ? UNPUBLISH : PUBLISH, { id: topicId });
      toast(published ? "Topic unpublished" : "Topic published");
      startTransition(() => router.refresh());
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Action failed");
    }
  }

  async function reassign() {
    if (!newHost) return;
    try {
      await clientGql(REASSIGN, { id: topicId, host: newHost });
      toast("Topic reassigned");
      setNewHost("");
      startTransition(() => router.refresh());
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Action failed");
    }
  }

  const reassignOptions = hosts.filter((h) => h.id !== currentHostId);

  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="row wrap divider-top" style={{ gap: 8, paddingTop: 10 }}>
        <span className="faint" style={{ fontSize: 11 }}>
          {label}:
        </span>
        <button
          className="btn btn-ghost"
          type="button"
          onClick={() => setEditing((v) => !v)}
        >
          {editing ? "Close editor" : "Edit"}
        </button>
        <button
          className="btn btn-ghost"
          type="button"
          disabled={pending}
          onClick={togglePublished}
        >
          {published ? "Unpublish" : "Publish"}
        </button>
        {reassignOptions.length > 0 ? (
          <>
            <select
              aria-label="Reassign topic owner"
              value={newHost}
              onChange={(e) => setNewHost(e.target.value)}
              style={{ width: "auto", fontSize: 12, padding: "6px 8px" }}
            >
              <option value="">Reassign owner…</option>
              {reassignOptions.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name ?? h.id}
                </option>
              ))}
            </select>
            <button
              className="btn btn-ghost"
              type="button"
              disabled={pending || !newHost}
              onClick={reassign}
            >
              Assign
            </button>
          </>
        ) : null}
      </div>
      {editing ? (
        <TopicEditForm
          topic={topic}
          slug={slug}
          onDone={() => setEditing(false)}
        />
      ) : null}
    </div>
  );
}
