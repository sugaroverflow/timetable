"use client";

import Link from "next/link";

import { AdminCommentsPanel } from "@/components/AdminCommentsPanel";
import { AdminTopicActions } from "@/components/AdminTopicActions";
import { Avatar } from "@/components/Avatar";
import { CollapsibleTopicBody } from "@/components/CollapsibleTopicBody";
import { PersonChip } from "@/components/PersonChip";
import { TopicEditScope } from "@/components/TopicEditScope";
import type { ManagedTopic } from "@/lib/feedTypes";
import { topicPath } from "@/lib/topicPath";

/** Header + cover + body — the block the edit form replaces in place. */
function ModerationContent({
  topic,
  slug,
  permalink,
  hostLabel,
}: {
  topic: ManagedTopic;
  slug: string;
  permalink: string | null;
  hostLabel: string;
}) {
  /* Avatar + author name click through to the host's page, like the feed
   * card (links pass 2026-08-03); hostId is optional on ManagedTopic. */
  const chip = (children: React.ReactNode) =>
    topic.hostId ? (
      <PersonChip slug={slug} userId={topic.hostId}>
        {children}
      </PersonChip>
    ) : (
      children
    );
  return (
    <>
      {/* Same header treatment as the feed card: avatar + title + author. */}
      <div className="row" style={{ alignItems: "flex-start" }}>
        {chip(
          <Avatar
            name={topic.hostName ?? null}
            image={topic.hostImage ?? null}
          />,
        )}
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
            by {chip(topic.hostName ?? hostLabel)}
          </div>
        </div>
        {/* Readiness badge — earns its keep in the "All" view, where ready
            and still-drafting topics sit together (2026-08-06). */}
        <span
          className={`status-badge ${topic.readyAt ? "status-ready" : "status-drafting"}`}
          style={{ marginLeft: "auto" }}
        >
          {topic.readyAt ? "ready to publish" : "still drafting"}
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
  electorLabel,
  hosts = [],
}: {
  topic: ManagedTopic;
  slug: string;
  viewerId?: string | null;
  hostLabel?: string;
  adminLabel?: string;
  electorLabel?: string;
  hosts?: { id: string; name: string | null }[];
}) {
  const permalink = topicPath(
    slug,
    topic.hostSlug ?? null,
    topic.slug ?? null,
    topic.hostId,
  );
  const roleLabels = {
    admin: adminLabel,
    host: hostLabel,
    elector: electorLabel,
  };

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
            slug={slug}
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
          roleLabels={roleLabels}
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
