"use client";

import Link from "next/link";

import { AdminCommentsPanel } from "@/components/AdminCommentsPanel";
import { AdminTopicActions } from "@/components/AdminTopicActions";
import { Avatar } from "@/components/Avatar";
import { CollapsibleTopicBody } from "@/components/CollapsibleTopicBody";
import { TopicEditScope } from "@/components/TopicEditScope";
import type { ManagedTopic } from "@/lib/feedTypes";
import { topicPath } from "@/lib/topicPath";

/** Header + cover + body — the block the edit form replaces in place. */
function ModerationContent({
  topic,
  permalink,
  hostLabel,
}: {
  topic: ManagedTopic;
  permalink: string | null;
  hostLabel: string;
}) {
  return (
    <>
      {/* Same header treatment as the feed card: avatar + title + author. */}
      <div className="row" style={{ alignItems: "flex-start" }}>
        <Avatar name={topic.hostName ?? null} image={topic.hostImage ?? null} />
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
      <CollapsibleTopicBody html={topic.bodyHtml} />
    </>
  );
}

/** A submitted topic on Pending Topics. Admins get the full shared action
 * set (publish, edit, reassign owner — issue #59); feedback happens in the
 * admin comments thread (QA #59 round 3 — the request-changes flow is
 * gone). */
export function ModerationCard({
  topic,
  slug,
  viewerId = null,
  hostLabel = "Host",
  adminLabel = "Admin",
  hosts = [],
}: {
  topic: ManagedTopic;
  slug: string;
  viewerId?: string | null;
  hostLabel?: string;
  adminLabel?: string;
  hosts?: { id: string; name: string | null }[];
}) {
  const permalink = topicPath(
    slug,
    topic.hostSlug ?? null,
    topic.slug ?? null,
    topic.hostId,
  );

  return (
    <li className="card stack">
      {/* Editing swaps the header/cover/body for the form in place
          (QA 2026-07-29) — the drafting thread and action bar stay put. */}
      <TopicEditScope
        topic={{
          id: topic.id,
          title: topic.title,
          bodyMd: topic.bodyMd,
          coverImageUrl: topic.coverImageUrl,
        }}
        slug={slug}
        content={
          <ModerationContent
            topic={topic}
            permalink={permalink}
            hostLabel={hostLabel}
          />
        }
      >
        <AdminCommentsPanel
          topicId={topic.id}
          viewerId={viewerId}
          comments={topic.adminComments ?? []}
          canModerate={true}
          slug={slug}
          adminLabel={adminLabel}
          hostLabel={hostLabel}
        />
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
      </TopicEditScope>
    </li>
  );
}
