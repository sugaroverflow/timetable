"use client";

import { useState } from "react";

import { useGqlAction } from "@/lib/useGqlAction";

import { TopicEditForm } from "./TopicEditForm";
import { useTopicEditing } from "./TopicEditScope";

const UNPUBLISH = `mutation($id: String!){ unpublishTopic(topicId: $id){ id } }`;
const PUBLISH = `mutation($id: String!){ moderateTopic(topicId: $id, action: "publish"){ id } }`;
const REASSIGN = `mutation($id: String!, $host: String!){ reassignTopic(topicId: $id, hostId: $host){ id } }`;
const UNREADY = `mutation($id: String!){ setTopicReady(topicId: $id, ready: false){ id } }`;

/** Admin sends a draft its host marked "Ready to publish" back to
 * drafting (Ed, 2026-09-08). One-way on purpose: "ready" is the host's
 * call (their ReadySwitch), the admin's is "not yet" — so this only ever
 * clears the mark, and the topic drops out of the Pending page's default
 * ready view on refresh. Renders nothing unless the topic is a ready
 * draft. */
function BackToDraftingButton({
  topicId,
  status,
  readyAt,
}: {
  topicId: string;
  status?: string;
  readyAt?: string | null;
}) {
  const { run, busy } = useGqlAction();
  if (status !== "submitted" || !readyAt) return null;
  return (
    <button
      className="btn btn-ghost"
      type="button"
      disabled={busy}
      onClick={() =>
        void run(
          UNREADY,
          { id: topicId },
          { success: "Moved back to drafting", errorFallback: "Action failed" },
        )
      }
    >
      Back to drafting
    </button>
  );
}

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
    /** The host's "Ready to publish" mark on a draft; call sites that
     * don't carry it (feed cards) never show the Back to drafting
     * button. */
    readyAt?: string | null;
  };
  slug: string;
  label?: string;
  hosts?: { id: string; name: string | null }[];
  currentHostId?: string;
}) {
  const topicId = topic.id;
  const { run, busy } = useGqlAction();
  // Inside a TopicEditScope, Edit swaps the card content for the form
  // (QA 2026-07-29); local below-the-bar rendering is the unscoped fallback.
  const scope = useTopicEditing();
  const [localEditing, setLocalEditing] = useState(false);
  const editing = scope ? scope.editing : localEditing;
  const setEditing = scope ? scope.setEditing : setLocalEditing;
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
          onClick={() => setEditing(!editing)}
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
        <BackToDraftingButton
          topicId={topicId}
          status={topic.status}
          readyAt={topic.readyAt}
        />
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
      {!scope && localEditing ? (
        <TopicEditForm
          topic={topic}
          slug={slug}
          onDone={() => setLocalEditing(false)}
        />
      ) : null}
    </div>
  );
}
