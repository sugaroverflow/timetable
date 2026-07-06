"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { CommentComposer } from "@/components/CommentComposer";
import { CommentList } from "@/components/CommentList";
import { useToast } from "@/components/Toast";
import { TopicEditForm } from "@/components/TopicEditForm";
import { clientGql } from "@/lib/clientGraphql";
import type { ManagedTopic } from "@/lib/feedTypes";

const SUBMIT = `mutation($id: String!){ submitTopic(topicId: $id){ id } }`;
const UNPUBLISH = `mutation($id: String!){ unpublishTopic(topicId: $id){ id } }`;

export function TopicManager({
  topic,
  slug,
}: {
  topic: ManagedTopic;
  slug: string;
}) {
  const router = useRouter();
  const { toast, toastError } = useToast();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);

  async function run(
    query: string,
    variables: Record<string, unknown>,
    successMessage: string,
  ) {
    try {
      await clientGql(query, variables);
      toast(successMessage);
      startTransition(() => router.refresh());
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Action failed");
    }
  }

  return (
    <li className="card">
      <div className="row wrap" style={{ justifyContent: "space-between" }}>
        <strong>{topic.title}</strong>
        <span className={`status-badge status-${topic.status}`}>
          {topic.status}
        </span>
      </div>

      {(topic.hostOnlyComments?.length ?? 0) > 0 ? (
        <div className="mod-feedback-box" style={{ marginTop: 10 }}>
          <div className="mfb-head">
            {topic.feedback ? "↩ Changes requested" : "🔒 Feedback thread"}
          </div>
          <CommentList
            comments={topic.hostOnlyComments ?? []}
            canReply={true}
            canModerate={false}
          />
          <CommentComposer topicId={topic.id} visibility="host_only" />
        </div>
      ) : null}

      {editing ? (
        <div style={{ marginTop: 10 }}>
          <TopicEditForm
            topic={topic}
            slug={slug}
            onDone={() => setEditing(false)}
          />
        </div>
      ) : (
        <div className="row wrap" style={{ marginTop: 10 }}>
          {(topic.status === "draft" || topic.status === "unpublished") && (
            <button
              className="btn btn-primary"
              type="button"
              disabled={pending}
              onClick={() => run(SUBMIT, { id: topic.id }, "Submitted for review")}
            >
              Submit for review
            </button>
          )}
          {topic.status === "published" && (
            <button
              className="btn"
              type="button"
              disabled={pending}
              onClick={() => run(UNPUBLISH, { id: topic.id }, "Topic unpublished")}
            >
              Unpublish
            </button>
          )}
          {topic.status === "submitted" && !topic.feedback && (
            <span className="faint" style={{ fontSize: 13 }}>
              Pending review…
            </span>
          )}
          {topic.status === "submitted" && topic.feedback && (
            <>
              <span className="faint" style={{ fontSize: 13 }}>
                Changes requested — edit and resubmit when ready
              </span>
              <button
                className="btn btn-primary"
                type="button"
                onClick={() => setEditing(true)}
              >
                Edit &amp; resubmit
              </button>
            </>
          )}
          <button
            className="btn btn-ghost"
            type="button"
            onClick={() => setEditing(true)}
          >
            Edit
          </button>
        </div>
      )}
    </li>
  );
}
