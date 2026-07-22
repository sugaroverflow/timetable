"use client";

import { useState } from "react";

import type { TopicStatus } from "@/lib/feedTypes";
import { useGqlAction } from "@/lib/useGqlAction";

import { TopicEditForm } from "./TopicEditForm";

const UNPUBLISH = `mutation($id: String!){ unpublishTopic(topicId: $id){ id } }`;

/** Owner's action bar on a feed card: edit in place and unpublish
 * (QA #42 — hosts can edit their own topics from the feed). */
export function HostTopicActions({
  topic,
  slug,
  label = "Host",
}: {
  topic: {
    id: string;
    title: string;
    bodyMd: string;
    coverImageUrl: string | null;
    status: TopicStatus;
  };
  slug: string;
  label?: string;
}) {
  const { run, busy } = useGqlAction();
  const [editing, setEditing] = useState(false);

  function unpublish() {
    void run(
      UNPUBLISH,
      { id: topic.id },
      { success: "Topic unpublished", errorFallback: "Action failed" },
    );
  }

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
        {topic.status === "published" ? (
          <button
            className="btn btn-ghost"
            type="button"
            disabled={busy}
            onClick={unpublish}
          >
            Unpublish
          </button>
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
