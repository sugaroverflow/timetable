"use client";

import { countNested } from "@/lib/commentTree";
import type { FeedComment, ManagedTopic } from "@/lib/feedTypes";
import { pluralLabel, type RoleLabels } from "@/lib/timetableSettings";

import { AdminCommentsBody, AdminCommentsPanel } from "./AdminCommentsPanel";
import { CardSectionTabs, type CardSection } from "./CardSectionTabs";
import { CommentComposer } from "./CommentComposer";
import { CommentList } from "./CommentList";
import { HostOnlyThreadBody } from "./HostOnlyPanel";
import { TopicScheduleBody } from "./TopicSchedulePanel";

/** The public-comments pane: composer (published topics) + thread. */
function PublicCommentsPane({
  topicId,
  published,
  comments,
  viewerId,
  slug,
  roleLabels,
}: {
  topicId: string;
  published: boolean;
  comments: FeedComment[];
  viewerId: string | null;
  slug: string;
  roleLabels?: RoleLabels;
}) {
  return (
    <div className="stack" style={{ gap: 10 }}>
      {published ? (
        <CommentComposer topicId={topicId} mentionSlug={slug} />
      ) : null}
      {comments.length > 0 ? (
        <CommentList
          comments={comments}
          canReply={true}
          canModerate={false}
          viewerId={viewerId}
          slug={slug}
          roleLabels={roleLabels}
        />
      ) : (
        <div className="faint" style={{ fontSize: 12 }}>
          No comments yet.
        </div>
      )}
    </div>
  );
}

type SectionArgs = {
  topic: ManagedTopic;
  slug: string;
  viewerId: string | null;
  hostLabel: string;
  adminLabel: string;
  roleLabels?: RoleLabels;
  calendarEnabled: boolean;
  canPencilSessions: boolean;
  publicComments: FeedComment[];
  hostComments: FeedComment[];
  adminComments: FeedComment[];
  published: boolean;
};

function commentsSection(a: SectionArgs): CardSection | null {
  const count = countNested(a.publicComments);
  if (!a.published && count === 0) return null;
  return {
    value: "comments",
    icon: "comments",
    text: "Comments",
    badge: count > 0 ? `(${count})` : undefined,
    pane: (
      <PublicCommentsPane
        topicId={a.topic.id}
        published={a.published}
        comments={a.publicComments}
        viewerId={a.viewerId}
        slug={a.slug}
        roleLabels={a.roleLabels}
      />
    ),
  };
}

/** Same visibility rule as the old stacked HostOnlyPanel: the section
 * earns its place when there is host-side content to show. */
function hostSection(a: SectionArgs): CardSection | null {
  const hostHearters = a.topic.hostHearters ?? null;
  const count = countNested(a.hostComments);
  const hearts = hostHearters?.length ?? 0;
  if (count === 0 && hearts === 0) return null;
  return {
    value: "host",
    icon: "host",
    text: `${a.hostLabel}-only`,
    badge:
      [count > 0 ? `(${count})` : null, hearts > 0 ? `💙 ${hearts}` : null]
        .filter(Boolean)
        .join(" · ") || undefined,
    pane: (
      // No 💙 toggle on your own topic: read-only row.
      <HostOnlyThreadBody
        topicId={a.topic.id}
        viewerId={a.viewerId}
        comments={a.hostComments}
        canModerate={false}
        slug={a.slug}
        hostLabel={a.hostLabel}
        roleLabels={a.roleLabels}
        hostHearters={hostHearters}
      />
    ),
  };
}

function adminSection(a: SectionArgs): CardSection {
  const count = countNested(a.adminComments);
  return {
    value: "admin",
    icon: "admin",
    text: pluralLabel(a.adminLabel),
    badge: count > 0 ? `(${count})` : undefined,
    pane: (
      // Drafting thread with the admins (QA #59 round 3).
      <AdminCommentsBody
        topicId={a.topic.id}
        viewerId={a.viewerId}
        comments={a.adminComments}
        canModerate={false}
        slug={a.slug}
        adminLabel={a.adminLabel}
        roleLabels={a.roleLabels}
      />
    ),
  };
}

function scheduleSection(a: SectionArgs): CardSection | null {
  if (!a.calendarEnabled || !a.published) return null;
  return {
    value: "schedule",
    icon: "schedule",
    text: "Scheduling",
    pane: (
      <TopicScheduleBody
        slug={a.slug}
        topicId={a.topic.id}
        canPencil={a.canPencilSessions}
      />
    ),
  };
}

/** topic-card-tabs on My Topics (2026-08-14): public comments /
 * {host}-only / drafting thread / Scheduling as one horizontal strip.
 * With a single live section (e.g. a fresh submitted topic: drafting
 * only) the card falls back to the pre-tabs presentation. */
export function TopicCardTabs({
  topic,
  slug,
  viewerId,
  hostLabel,
  adminLabel,
  roleLabels,
  calendarEnabled,
  canPencilSessions,
}: {
  topic: ManagedTopic;
  slug: string;
  viewerId: string | null;
  hostLabel: string;
  adminLabel: string;
  roleLabels?: RoleLabels;
  calendarEnabled: boolean;
  canPencilSessions: boolean;
}) {
  const args: SectionArgs = {
    topic,
    slug,
    viewerId,
    hostLabel,
    adminLabel,
    roleLabels,
    calendarEnabled,
    canPencilSessions,
    publicComments: topic.comments ?? [],
    hostComments: topic.hostOnlyComments ?? [],
    adminComments: topic.adminComments ?? [],
    published: topic.status === "published",
  };
  const sections = [
    commentsSection(args),
    hostSection(args),
    adminSection(args),
    scheduleSection(args),
  ].filter((s): s is CardSection => s !== null);

  // Single live section = the drafting thread (fresh submitted topic):
  // fall back to the pre-tabs collapsible rather than a one-tab strip.
  if (sections.length === 1 && sections[0]!.value === "admin") {
    return (
      <AdminCommentsPanel
        topicId={topic.id}
        viewerId={viewerId}
        comments={args.adminComments}
        canModerate={false}
        slug={slug}
        adminLabel={adminLabel}
        roleLabels={roleLabels}
      />
    );
  }

  return <CardSectionTabs sections={sections} />;
}
