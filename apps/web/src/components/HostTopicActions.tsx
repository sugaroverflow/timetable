"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { useToast } from "@/components/Toast";
import { clientGql } from "@/lib/clientGraphql";
import type { TopicStatus } from "@/lib/feedTypes";

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
  const router = useRouter();
  const { toast, toastError } = useToast();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);

  async function unpublish() {
    try {
      await clientGql(UNPUBLISH, { id: topic.id });
      toast("Topic unpublished");
      startTransition(() => router.refresh());
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Action failed");
    }
  }

  return (
    <div className="stack" style={{ gap: 8 }}>
      <div
        className="row wrap"
        style={{ gap: 8, borderTop: "1px solid var(--line)", paddingTop: 10 }}
      >
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
            disabled={pending}
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
