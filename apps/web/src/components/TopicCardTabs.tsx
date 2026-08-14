"use client";

import { Tabs } from "@base-ui/react/tabs";
import { CalendarDays, Lock, MessageCircle, Shield } from "lucide-react";

import { countNested } from "@/lib/commentTree";
import type { FeedComment, ManagedTopic } from "@/lib/feedTypes";
import { pluralLabel, type RoleLabels } from "@/lib/timetableSettings";

import { AdminCommentsBody } from "./AdminCommentsPanel";
import { CommentComposer } from "./CommentComposer";
import { CommentList } from "./CommentList";
import { HostOnlyThreadBody } from "./HostOnlyPanel";
import { TopicScheduleBody } from "./TopicSchedulePanel";

/** The tab strip labels, count badges included. */
function CardTabList({
  publicCount,
  hostCount,
  hostHeartCount,
  adminCount,
  showHostTab,
  showScheduleTab,
  hostLabel,
  adminsLabel,
}: {
  publicCount: number;
  hostCount: number;
  hostHeartCount: number;
  adminCount: number;
  showHostTab: boolean;
  showScheduleTab: boolean;
  hostLabel: string;
  adminsLabel: string;
}) {
  return (
    <Tabs.List className="card-tabs" aria-label="Topic sections">
      <Tabs.Tab value="comments">
        <MessageCircle size={13} aria-hidden /> Comments
        {publicCount > 0 ? ` (${publicCount})` : ""}
      </Tabs.Tab>
      {showHostTab ? (
        <Tabs.Tab value="host">
          <Lock size={13} aria-hidden /> {hostLabel}-only
          {hostCount > 0 ? ` (${hostCount})` : ""}
          {hostHeartCount > 0 ? ` · 💙 ${hostHeartCount}` : ""}
        </Tabs.Tab>
      ) : null}
      <Tabs.Tab value="admin" title={`Visible to you and ${adminsLabel} only`}>
        <Shield size={13} aria-hidden /> {adminsLabel}
        {adminCount > 0 ? ` (${adminCount})` : ""}
      </Tabs.Tab>
      {showScheduleTab ? (
        <Tabs.Tab value="schedule">
          <CalendarDays size={13} aria-hidden /> Scheduling
        </Tabs.Tab>
      ) : null}
    </Tabs.List>
  );
}

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

/** topic-card-tabs (2026-08-14): the My Topics card's four sections —
 * public comments / {host}-only / drafting thread / scheduling — as one
 * horizontal tab strip instead of stacked collapsibles (Ed's round-3
 * feedback). Inactive panels stay unmounted (Base UI default), so the
 * Scheduling tab keeps its lazy fetch-on-first-open behaviour. */
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
  const publicComments = topic.comments ?? [];
  const hostComments = topic.hostOnlyComments ?? [];
  const adminComments = topic.adminComments ?? [];
  const hostHearters = topic.hostHearters ?? null;
  const published = topic.status === "published";
  const hostHeartCount = hostHearters?.length ?? 0;
  const hostCount = countNested(hostComments);
  // Same visibility rule as the old stacked HostOnlyPanel: the tab earns
  // its place when there is host-side content to show.
  const showHostTab = hostCount > 0 || hostHeartCount > 0;
  const showScheduleTab = calendarEnabled && published;

  return (
    <Tabs.Root defaultValue="comments">
      <CardTabList
        publicCount={countNested(publicComments)}
        hostCount={hostCount}
        hostHeartCount={hostHeartCount}
        adminCount={countNested(adminComments)}
        showHostTab={showHostTab}
        showScheduleTab={showScheduleTab}
        hostLabel={hostLabel}
        adminsLabel={pluralLabel(adminLabel)}
      />

      <Tabs.Panel value="comments" className="card-tab-panel">
        <PublicCommentsPane
          topicId={topic.id}
          published={published}
          comments={publicComments}
          viewerId={viewerId}
          slug={slug}
          roleLabels={roleLabels}
        />
      </Tabs.Panel>

      {showHostTab ? (
        <Tabs.Panel value="host" className="card-tab-panel">
          {/* No 💙 toggle on your own topic: read-only row. */}
          <HostOnlyThreadBody
            topicId={topic.id}
            viewerId={viewerId}
            comments={hostComments}
            canModerate={false}
            slug={slug}
            hostLabel={hostLabel}
            roleLabels={roleLabels}
            hostHearters={hostHearters}
          />
        </Tabs.Panel>
      ) : null}

      <Tabs.Panel value="admin" className="card-tab-panel">
        {/* Drafting thread with the admins (QA #59 round 3). */}
        <AdminCommentsBody
          topicId={topic.id}
          viewerId={viewerId}
          comments={adminComments}
          canModerate={false}
          slug={slug}
          adminLabel={adminLabel}
          roleLabels={roleLabels}
        />
      </Tabs.Panel>

      {showScheduleTab ? (
        <Tabs.Panel value="schedule" className="card-tab-panel">
          <TopicScheduleBody
            slug={slug}
            topicId={topic.id}
            canPencil={canPencilSessions}
          />
        </Tabs.Panel>
      ) : null}
    </Tabs.Root>
  );
}
