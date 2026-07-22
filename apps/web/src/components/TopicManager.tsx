"use client";

import Link from "next/link";
import { useState } from "react";

import { AdminCommentsPanel } from "@/components/AdminCommentsPanel";
import { AdminTopicActions } from "@/components/AdminTopicActions";
import { CommentComposer } from "@/components/CommentComposer";
import { CommentList } from "@/components/CommentList";
import { HostOnlyPanel } from "@/components/HostOnlyPanel";
import { TopicEditForm } from "@/components/TopicEditForm";
import type { ManagedTopic } from "@/lib/feedTypes";
import { topicPath } from "@/lib/topicPath";
import { useGqlAction } from "@/lib/useGqlAction";

const SUBMIT = `mutation($id: String!){ submitTopic(topicId: $id){ id } }`;
const UNPUBLISH = `mutation($id: String!){ unpublishTopic(topicId: $id){ id } }`;

/** The manage block under a My Topics card. Hosts get submit/unpublish/edit
 * gated by status; admins get the shared admin set instead (publish, edit,
 * reassign owner — issue #59), same precedence as the feed's TopicCard. */
function ManageControls({
  topic,
  slug,
  adminLabel,
  isAdmin,
  hosts,
}: {
  topic: ManagedTopic;
  slug: string;
  adminLabel: string;
  isAdmin: boolean;
  hosts: { id: string; name: string | null }[];
}) {
  const { run: runAction, busy } = useGqlAction();
  const [editing, setEditing] = useState(false);

  function run(
    query: string,
    variables: Record<string, unknown>,
    successMessage: string,
  ) {
    void runAction(query, variables, {
      success: successMessage,
      errorFallback: "Action failed",
    });
  }

  if (isAdmin) {
    return (
      <AdminTopicActions
        topic={{
          id: topic.id,
          title: topic.title,
          bodyMd: topic.bodyMd,
          coverImageUrl: topic.coverImageUrl,
          status: topic.status,
        }}
        slug={slug}
        label={adminLabel}
        hosts={hosts}
        currentHostId={topic.hostId}
      />
    );
  }

  if (editing) {
    return (
      <TopicEditForm
        topic={topic}
        slug={slug}
        onDone={() => setEditing(false)}
      />
    );
  }

  return (
    <div className="row wrap divider-top" style={{ paddingTop: 10 }}>
      {topic.status === "unpublished" && (
        <button
          className="btn btn-primary"
          type="button"
          disabled={busy}
          onClick={() => run(SUBMIT, { id: topic.id }, "Submitted for review")}
        >
          Submit for review
        </button>
      )}
      {topic.status === "published" && (
        <button
          className="btn"
          type="button"
          disabled={busy}
          onClick={() => run(UNPUBLISH, { id: topic.id }, "Topic unpublished")}
        >
          Unpublish
        </button>
      )}
      {topic.status === "submitted" && (
        <span className="faint" style={{ fontSize: 13 }}>
          Pending review…
        </span>
      )}
      <button
        className="btn btn-ghost"
        type="button"
        onClick={() => setEditing(true)}
      >
        Edit
      </button>
    </div>
  );
}

/** A topic on My Topics — renders like a feed card (cover, description,
 * comments, {host}-only thread; QA #59) with the manage controls below. */
export function TopicManager({
  topic,
  slug,
  hostLabel,
  adminLabel,
  isAdmin,
  hosts,
}: {
  topic: ManagedTopic;
  slug: string;
  hostLabel: string;
  adminLabel: string;
  isAdmin: boolean;
  hosts: { id: string; name: string | null }[];
}) {
  const permalink =
    topic.status === "published"
      ? topicPath(slug, topic.hostSlug ?? null, topic.slug ?? null)
      : null;
  const publicComments = topic.comments ?? [];
  const hostComments = topic.hostOnlyComments ?? [];

  return (
    <li className="card stack">
      <div className="row wrap" style={{ justifyContent: "space-between" }}>
        <h3 className="topic-title" style={{ margin: 0 }}>
          {permalink ? (
            <Link href={permalink} className="topic-title-link">
              {topic.title}
            </Link>
          ) : (
            topic.title
          )}
        </h3>
        <span className={`status-badge status-${topic.status}`}>
          {topic.status}
        </span>
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

      {publicComments.length > 0 ? (
        <CommentList
          comments={publicComments}
          canReply={true}
          canModerate={false}
          slug={slug}
        />
      ) : null}
      {topic.status === "published" ? (
        <CommentComposer topicId={topic.id} mentionSlug={slug} />
      ) : null}

      {hostComments.length > 0 ? (
        <HostOnlyPanel
          topicId={topic.id}
          comments={hostComments}
          canModerate={false}
          slug={slug}
          hostLabel={hostLabel}
        />
      ) : null}

      {/* Drafting thread with the admins (QA #59 round 3). */}
      <AdminCommentsPanel
        topicId={topic.id}
        comments={topic.adminComments ?? []}
        canModerate={false}
        slug={slug}
        adminLabel={adminLabel}
      />

      <ManageControls
        topic={topic}
        slug={slug}
        adminLabel={adminLabel}
        isAdmin={isAdmin}
        hosts={hosts}
      />
    </li>
  );
}
