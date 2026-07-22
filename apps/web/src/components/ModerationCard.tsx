"use client";

import Link from "next/link";
import { useState } from "react";

import { AdminCommentsPanel } from "@/components/AdminCommentsPanel";
import { Avatar } from "@/components/Avatar";
import { TopicEditForm } from "@/components/TopicEditForm";
import type { ManagedTopic } from "@/lib/feedTypes";
import { topicPath } from "@/lib/topicPath";
import { useGqlAction } from "@/lib/useGqlAction";

const MUTATION = `mutation Moderate($id: String!, $action: String!) {
  moderateTopic(topicId: $id, action: $action) { id status }
}`;

/** A submitted topic on Pending Topics. Moderation is Publish or Edit;
 * feedback happens in the admin comments thread (QA #59 round 3 — the
 * request-changes flow is gone). */
export function ModerationCard({
  topic,
  slug,
  hostLabel = "Host",
  adminLabel = "Admin",
}: {
  topic: ManagedTopic;
  slug: string;
  hostLabel?: string;
  adminLabel?: string;
}) {
  const { run, busy } = useGqlAction();
  const [editing, setEditing] = useState(false);

  function publish() {
    void run(
      MUTATION,
      { id: topic.id, action: "publish" },
      { success: "Topic published", errorFallback: "Moderation failed" },
    );
  }

  const permalink = topicPath(slug, topic.hostSlug ?? null, topic.slug ?? null);

  return (
    <li className="card stack">
      {/* Same header treatment as the feed card: avatar + title + author. */}
      <div className="row" style={{ alignItems: "flex-start" }}>
        <Avatar name={topic.hostName ?? null} />
        <div>
          <h3 className="topic-title">
            {permalink ? (
              <Link href={permalink} className="topic-title-link">
                {topic.title}
              </Link>
            ) : (
              topic.title
            )}
          </h3>
          <div className="faint" style={{ fontSize: 12 }}>
            by {topic.hostName ?? hostLabel}
          </div>
        </div>
      </div>
      {topic.coverImageUrl ? (
        <div
          className="topic-cover"
          style={{ backgroundImage: `url(${topic.coverImageUrl})` }}
          aria-label={`${topic.title} cover image`}
        />
      ) : null}
      <div
        className="topic-body"
        dangerouslySetInnerHTML={{ __html: topic.bodyHtml }}
      />
      <AdminCommentsPanel
        topicId={topic.id}
        comments={topic.adminComments ?? []}
        canModerate={true}
        slug={slug}
        adminLabel={adminLabel}
      />
      <div className="row wrap">
        <button
          className="btn btn-primary"
          type="button"
          disabled={busy}
          onClick={publish}
        >
          Publish
        </button>
        <button
          className="btn"
          type="button"
          disabled={busy}
          onClick={() => setEditing((v) => !v)}
        >
          {editing ? "Cancel edit" : "Edit"}
        </button>
      </div>
      {editing ? (
        <TopicEditForm
          topic={topic}
          slug={slug}
          onDone={() => setEditing(false)}
        />
      ) : null}
    </li>
  );
}
