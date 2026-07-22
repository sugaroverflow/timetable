import { Heart } from "lucide-react";
import Link from "next/link";

import type { FeedTopic } from "@/lib/feedTypes";
import { topicPath } from "@/lib/topicPath";

import { AdminTopicActions } from "./AdminTopicActions";
import { Avatar } from "./Avatar";
import { BreakdownToggle } from "./BreakdownToggle";
import { CommentComposer } from "./CommentComposer";
import { CommentList } from "./CommentList";
import { FocusCommentButton } from "./FocusCommentButton";
import { HeartButton } from "./HeartButton";
import { HostOnlyPanel } from "./HostOnlyPanel";
import { HostTopicActions } from "./HostTopicActions";
import { PersonChip } from "./PersonChip";

export type FeedPerms = {
  canHeart: boolean;
  canComment: boolean;
  canHostOnly: boolean;
  canModerate: boolean;
};

function TopicHead({
  topic,
  slug,
  hostLabel,
  isNew,
  permalink,
}: {
  topic: FeedTopic;
  slug: string;
  hostLabel: string;
  isNew: boolean;
  permalink: string | null;
}) {
  return (
    <div className="row topic-head" style={{ alignItems: "flex-start" }}>
      <PersonChip slug={slug} userId={topic.hostId}>
        <Avatar name={topic.hostName} />
      </PersonChip>
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
        <div className="faint topic-byline">
          by{" "}
          <PersonChip slug={slug} userId={topic.hostId}>
            {topic.hostName ?? hostLabel}
          </PersonChip>
        </div>
      </div>
      {isNew ? (
        <>
          <span style={{ flex: 1 }} />
          <span className="pill pill-new">New</span>
        </>
      ) : null}
    </div>
  );
}

function HeartCommentRow({
  topic,
  canHeart,
  viewerHeartCount,
}: {
  topic: FeedTopic;
  canHeart: boolean;
  viewerHeartCount: number | null;
}) {
  return (
    <div className="card-actions">
      {canHeart ? (
        <HeartButton
          topicId={topic.id}
          hearted={topic.viewerHasHearted}
          count={topic.heartCount}
        />
      ) : (
        <span className="heart-btn" aria-hidden>
          <span className="ic">
            <Heart size={16} fill="currentColor" />
          </span>
          {topic.heartCount}
        </span>
      )}
      <FocusCommentButton
        topicId={topic.id}
        commentCount={topic.commentCount}
      />
      <span style={{ flex: 1 }} />
      {topic.viewerHasHearted && viewerHeartCount ? (
        <span className="weight-chip" title="Your current vote weight">
          your vote: 1/{viewerHeartCount}
        </span>
      ) : null}
    </div>
  );
}

/* The collapsed panels and role-gated action rows that close out the card:
 * vote breakdown, host-only comments, host actions, admin actions. */
function TopicTail({
  topic,
  perms,
  slug,
  isOwner,
  hostLabel,
  adminLabel,
  hosts,
  hostComments,
}: {
  topic: FeedTopic;
  perms: FeedPerms;
  slug: string;
  isOwner: boolean;
  hostLabel: string;
  adminLabel: string;
  hosts: { id: string; name: string | null }[];
  hostComments: FeedTopic["comments"];
}) {
  const editable = {
    id: topic.id,
    title: topic.title,
    bodyMd: topic.bodyMd,
    coverImageUrl: topic.coverImageUrl,
    status: topic.status,
  };
  return (
    <>
      {perms.canHostOnly && topic.weightedScore != null ? (
        <BreakdownToggle
          slug={slug}
          topicId={topic.id}
          className="host-panel"
          triggerClassName="host-panel-toggle"
        />
      ) : null}

      {perms.canHostOnly ? (
        <HostOnlyPanel
          topicId={topic.id}
          comments={hostComments}
          canModerate={perms.canModerate}
          slug={slug}
          hostLabel={hostLabel}
        />
      ) : null}

      {isOwner && !perms.canModerate ? (
        <HostTopicActions topic={editable} slug={slug} label={hostLabel} />
      ) : null}

      {perms.canModerate ? (
        <AdminTopicActions
          topic={editable}
          slug={slug}
          label={adminLabel}
          hosts={hosts}
          currentHostId={topic.hostId}
        />
      ) : null}
    </>
  );
}

/* Element order per QA #42: title, author, cover, description,
 * hearts + comments, comment bar, then the two collapsed panels
 * (vote breakdown, host-only comments), host actions, admin actions. */
export function TopicCard({
  topic,
  perms,
  slug,
  viewerId = null,
  isNew = false,
  hostLabel = "Host",
  adminLabel = "Admin",
  viewerHeartCount = null,
  hosts = [],
}: {
  topic: FeedTopic;
  perms: FeedPerms;
  slug: string;
  viewerId?: string | null;
  isNew?: boolean;
  hostLabel?: string;
  adminLabel?: string;
  viewerHeartCount?: number | null;
  hosts?: { id: string; name: string | null }[];
}) {
  const publicComments = topic.comments.filter(
    (c) => c.visibility !== "host_only",
  );
  const hostComments = topic.comments.filter(
    (c) => c.visibility === "host_only",
  );
  const isOwner = viewerId != null && viewerId === topic.hostId;
  const permalink = topicPath(slug, topic.hostSlug, topic.slug);

  return (
    <article className={`card stack${isNew ? " topic-new" : ""}`}>
      <TopicHead
        topic={topic}
        slug={slug}
        hostLabel={hostLabel}
        isNew={isNew}
        permalink={permalink}
      />

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

      <HeartCommentRow
        topic={topic}
        canHeart={perms.canHeart}
        viewerHeartCount={viewerHeartCount}
      />

      <CommentList
        comments={publicComments}
        canReply={perms.canComment}
        canModerate={perms.canModerate}
        slug={slug}
      />

      {perms.canComment ? (
        <CommentComposer topicId={topic.id} mentionSlug={slug} />
      ) : null}

      <TopicTail
        topic={topic}
        perms={perms}
        slug={slug}
        isOwner={isOwner}
        hostLabel={hostLabel}
        adminLabel={adminLabel}
        hosts={hosts}
        hostComments={hostComments}
      />
    </article>
  );
}
