"use client";

import Link from "next/link";
import { useState } from "react";

import { AdminCommentsPanel } from "@/components/AdminCommentsPanel";
import { AdminTopicActions } from "@/components/AdminTopicActions";
import { CollapsibleTopicBody } from "@/components/CollapsibleTopicBody";
import { CommentComposer } from "@/components/CommentComposer";
import { CommentList } from "@/components/CommentList";
import { HostOnlyPanel } from "@/components/HostOnlyPanel";
import { TopicEditScope, useTopicEditing } from "@/components/TopicEditScope";
import type { ManagedTopic } from "@/lib/feedTypes";
import { topicPath } from "@/lib/topicPath";
import { useGqlAction } from "@/lib/useGqlAction";

const SUBMIT = `mutation($id: String!){ submitTopic(topicId: $id){ id } }`;
const UNPUBLISH = `mutation($id: String!){ unpublishTopic(topicId: $id){ id } }`;
const DELETE = `mutation($id: String!){ deleteTopic(topicId: $id) }`;
const PUBLISH = `mutation($id: String!){ moderateTopic(topicId: $id, action: "publish"){ id } }`;

/** Two-step red Delete for a host's own not-yet-published topic (launch QA
 * 2026-07-29) — same confirm pattern as PersonAdminPanel's remove. */
function DeleteTopicButton({
  topicId,
  busy,
  onDelete,
}: {
  topicId: string;
  busy: boolean;
  onDelete: (topicId: string) => void;
}) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <button
        className="btn btn-ghost"
        type="button"
        style={{ color: "var(--red)" }}
        onClick={() => setConfirming(true)}
      >
        Delete
      </button>
    );
  }
  return (
    <>
      <span className="faint" style={{ fontSize: 13 }}>
        Delete this topic and its comments forever?
      </span>
      <button
        className="btn"
        type="button"
        style={{ color: "var(--red)" }}
        disabled={busy}
        onClick={() => onDelete(topicId)}
      >
        Yes, delete
      </button>
      <button
        className="btn btn-ghost"
        type="button"
        onClick={() => setConfirming(false)}
      >
        Cancel
      </button>
    </>
  );
}

/** The manage block under a My Topics card. Hosts get submit/unpublish/edit
 * gated by status; admins get the shared admin set instead (publish, edit,
 * reassign owner — issue #59), same precedence as the feed's TopicCard. */
function ManageControls({
  topic,
  slug,
  adminLabel,
  isAdmin,
  hosts,
  canPublishDirectly,
}: {
  topic: ManagedTopic;
  slug: string;
  adminLabel: string;
  isAdmin: boolean;
  hosts: { id: string; name: string | null }[];
  canPublishDirectly: boolean;
}) {
  const { run: runAction, busy } = useGqlAction();
  // Editing lives on the surrounding TopicEditScope: the form replaces the
  // topic's rendered content, not this control row (QA 2026-07-29).
  const scope = useTopicEditing();

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

  return (
    <div className="row wrap divider-top" style={{ paddingTop: 10 }}>
      <StatusAction
        topic={topic}
        busy={busy}
        run={run}
        canPublishDirectly={canPublishDirectly}
      />
      <button
        className="btn btn-ghost"
        type="button"
        onClick={() => scope?.setEditing(!scope.editing)}
      >
        {scope?.editing ? "Close editor" : "Edit"}
      </button>
      {topic.status !== "published" && topic.status !== "archived" && (
        <DeleteTopicButton
          topicId={topic.id}
          busy={busy}
          onDelete={(id) => run(DELETE, { id }, "Topic deleted")}
        />
      )}
    </div>
  );
}

/** The one status-changing action a host sees: Publish (when the forum lets
 * hosts publish directly — calendar-v2 PR), Submit for review, Unpublish, or
 * the pending note. */
function StatusAction({
  topic,
  busy,
  run,
  canPublishDirectly,
}: {
  topic: ManagedTopic;
  busy: boolean;
  run: (q: string, v: Record<string, unknown>, s: string) => void;
  canPublishDirectly: boolean;
}) {
  if (topic.status === "published") {
    return (
      <button
        className="btn"
        type="button"
        disabled={busy}
        onClick={() => run(UNPUBLISH, { id: topic.id }, "Topic unpublished")}
      >
        Unpublish
      </button>
    );
  }
  if (topic.status === "archived") return null;
  if (canPublishDirectly) {
    return (
      <button
        className="btn btn-primary"
        type="button"
        disabled={busy}
        onClick={() => run(PUBLISH, { id: topic.id }, "Topic published")}
      >
        Publish
      </button>
    );
  }
  if (topic.status === "unpublished") {
    return (
      <button
        className="btn btn-primary"
        type="button"
        disabled={busy}
        onClick={() => run(SUBMIT, { id: topic.id }, "Submitted for review")}
      >
        Submit for review
      </button>
    );
  }
  return (
    <span className="faint" style={{ fontSize: 13 }}>
      Pending review…
    </span>
  );
}

function permalinkFor(topic: ManagedTopic, slug: string): string | null {
  if (topic.status !== "published") return null;
  return topicPath(
    slug,
    topic.hostSlug ?? null,
    topic.slug ?? null,
    topic.hostId,
  );
}

/** A topic on My Topics — renders like a feed card (cover, description,
 * comments, {host}-only thread; QA #59) with the manage controls below. */
export function TopicManager({
  topic,
  slug,
  viewerId,
  hostLabel,
  adminLabel,
  isAdmin,
  hosts,
  canPublishDirectly = false,
}: {
  topic: ManagedTopic;
  slug: string;
  viewerId: string | null;
  hostLabel: string;
  adminLabel: string;
  isAdmin: boolean;
  hosts: { id: string; name: string | null }[];
  canPublishDirectly?: boolean;
}) {
  const permalink = permalinkFor(topic, slug);
  const publicComments = topic.comments ?? [];
  const hostComments = topic.hostOnlyComments ?? [];

  return (
    <li className="card stack">
      {/* Editing swaps the title/cover/body for the form in place
          (QA 2026-07-29) — comments, panels, and controls stay put. */}
      <TopicEditScope
        topic={{
          id: topic.id,
          title: topic.title,
          bodyMd: topic.bodyMd,
          coverImageUrl: topic.coverImageUrl,
        }}
        slug={slug}
        content={
          <>
            <div
              className="row wrap"
              style={{ justifyContent: "space-between" }}
            >
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

            <CollapsibleTopicBody html={topic.bodyHtml} />
          </>
        }
      >
        {publicComments.length > 0 ? (
          <CommentList
            comments={publicComments}
            canReply={true}
            canModerate={false}
            viewerId={viewerId}
            slug={slug}
          />
        ) : null}
        {topic.status === "published" ? (
          <CommentComposer topicId={topic.id} mentionSlug={slug} />
        ) : null}

        {hostComments.length > 0 ? (
          <HostOnlyPanel
            topicId={topic.id}
            viewerId={viewerId}
            comments={hostComments}
            canModerate={false}
            slug={slug}
            hostLabel={hostLabel}
          />
        ) : null}

        {/* Drafting thread with the admins (QA #59 round 3). */}
        <AdminCommentsPanel
          topicId={topic.id}
          viewerId={viewerId}
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
          canPublishDirectly={canPublishDirectly}
        />
      </TopicEditScope>
    </li>
  );
}
