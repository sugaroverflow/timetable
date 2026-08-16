"use client";

import { countNested } from "@/lib/commentTree";
import type { FeedComment, ManagedTopic } from "@/lib/feedTypes";
import { pluralLabel, type RoleLabels } from "@/lib/timetableSettings";

import { AdminCommentsBody, AdminCommentsPanel } from "./AdminCommentsPanel";
import { CommentComposer } from "./CommentComposer";
import { CommentList } from "./CommentList";
import { CommentsOpenScope } from "./CommentsOpenScope";
import { CommentTeaser } from "./CommentTeaser";
import { HostOnlyThreadBody } from "./HostOnlyPanel";
import { TopicScheduleBody } from "./TopicSchedulePanel";
import { TopicTabs, type TopicTab } from "./TopicTabs";

/** The public-comments pane: composer (published topics) + thread behind
 * the comment-teaser, exactly as a feed card does it (Ed, QA 2026-08-16 —
 * My Topics used to open the whole thread). A host's own dashboard is as
 * much a scrolling list as the feed is. */
function PublicCommentsPane({
  topicId,
  published,
  comments,
  seenAt,
  viewerId,
  slug,
  roleLabels,
}: {
  topicId: string;
  published: boolean;
  comments: FeedComment[];
  seenAt: string | null;
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
        <CommentTeaser topicId={topicId} comments={comments} seenAt={seenAt}>
          <CommentList
            comments={comments}
            canReply={true}
            canModerate={false}
            viewerId={viewerId}
            slug={slug}
            roleLabels={roleLabels}
          />
        </CommentTeaser>
      ) : (
        <div className="faint" style={{ fontSize: 12 }}>
          No comments yet.
        </div>
      )}
    </div>
  );
}

type TabArgs = {
  topic: ManagedTopic;
  slug: string;
  viewerId: string | null;
  hostLabel: string;
  adminLabel: string;
  roleLabels?: RoleLabels;
  calendarEnabled: boolean;
  canPencilSessions: boolean;
  hostCommentsEnabled: boolean;
  /** Admin viewers may hide comments in a slot chat. */
  canModerate: boolean;
  publicComments: FeedComment[];
  hostComments: FeedComment[];
  adminComments: FeedComment[];
  published: boolean;
};

function commentsTab(a: TabArgs): TopicTab | null {
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
        seenAt={a.topic.viewerCommentsSeenAt ?? null}
        viewerId={a.viewerId}
        slug={a.slug}
        roleLabels={a.roleLabels}
      />
    ),
  };
}

/** From publication onward (Ed, QA 2026-08-15) — the same rule the feed
 * card uses, so a host's topic doesn't wear different tabs on different
 * pages, and so the host can START a faculty conversation rather than only
 * reply to one. Kept for an unpublished topic that already has content, on
 * the principle that a tab you have seen must not vanish. */
function hostTab(a: TabArgs): TopicTab | null {
  const hostHearters = a.topic.hostHearters ?? null;
  const count = countNested(a.hostComments);
  const hearts = hostHearters?.length ?? 0;
  if (!a.hostCommentsEnabled) return null;
  if (!a.published && count === 0 && hearts === 0) return null;
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

function adminTab(a: TabArgs): TopicTab {
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

function schedulingTab(a: TabArgs): TopicTab | null {
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
        viewerId={a.viewerId}
        canModerate={a.canModerate}
        roleLabels={a.roleLabels}
      />
    ),
  };
}

/** topic-tabs on My Topics (2026-08-14): public comments /
 * {host}-only / drafting thread / Scheduling as one horizontal strip.
 * With a single live section (e.g. a fresh submitted topic: drafting
 * only) the card falls back to the pre-tabs presentation. */
export function MyTopicsTabs({
  topic,
  slug,
  viewerId,
  hostLabel,
  adminLabel,
  roleLabels,
  calendarEnabled,
  canPencilSessions,
  hostCommentsEnabled,
  canModerate,
}: {
  topic: ManagedTopic;
  slug: string;
  viewerId: string | null;
  hostLabel: string;
  adminLabel: string;
  roleLabels?: RoleLabels;
  calendarEnabled: boolean;
  canPencilSessions: boolean;
  hostCommentsEnabled: boolean;
  canModerate: boolean;
}) {
  const args: TabArgs = {
    topic,
    slug,
    viewerId,
    hostLabel,
    adminLabel,
    roleLabels,
    calendarEnabled,
    canPencilSessions,
    hostCommentsEnabled,
    canModerate,
    publicComments: topic.comments ?? [],
    hostComments: topic.hostOnlyComments ?? [],
    adminComments: topic.adminComments ?? [],
    published: topic.status === "published",
  };
  const tabs = [
    commentsTab(args),
    hostTab(args),
    adminTab(args),
    schedulingTab(args),
  ].filter((s): s is TopicTab => s !== null);

  // Single live tab = the drafting thread (fresh submitted topic): fall
  // back to the pre-tabs collapsible rather than a one-tab strip.
  if (tabs.length === 1 && tabs[0]!.value === "admin") {
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

  // The scope is what makes posting a comment unfold the teaser you just
  // posted into — the same wiring feed cards have (2026-08-16).
  return (
    <CommentsOpenScope>
      <TopicTabs tabs={tabs} />
    </CommentsOpenScope>
  );
}
