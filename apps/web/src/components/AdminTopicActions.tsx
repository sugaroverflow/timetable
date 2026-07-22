"use client";

import { useState } from "react";

import { useGqlAction } from "@/lib/useGqlAction";

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
  const { run, busy } = useGqlAction();
  const [editing, setEditing] = useState(false);
  const [newHost, setNewHost] = useState("");

  const published = topic.status == null || topic.status === "published";

  function togglePublished() {
    void run(
      published ? UNPUBLISH : PUBLISH,
      { id: topicId },
      {
        success: published ? "Topic unpublished" : "Topic published",
        errorFallback: "Action failed",
      },
    );
  }

  function reassign() {
    if (!newHost) return;
    void run(
      REASSIGN,
      { id: topicId, host: newHost },
      {
        success: "Topic reassigned",
        errorFallback: "Action failed",
        onSuccess: () => setNewHost(""),
      },
    );
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
          disabled={busy}
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
              disabled={busy || !newHost}
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
