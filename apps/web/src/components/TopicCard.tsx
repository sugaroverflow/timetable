import type { FeedTopic } from "@/lib/feedTypes";

import { AdminTopicActions } from "./AdminTopicActions";
import { Avatar } from "./Avatar";
import { CommentComposer } from "./CommentComposer";
import { CommentList } from "./CommentList";
import { FocusCommentButton } from "./FocusCommentButton";
import { HeartButton } from "./HeartButton";
import { HostInsightsPanel } from "./HostInsightsPanel";
import { HostOnlyPanel } from "./HostOnlyPanel";
import { HostTopicActions } from "./HostTopicActions";

export type FeedPerms = {
  canHeart: boolean;
  canComment: boolean;
  canHostOnly: boolean;
  canModerate: boolean;
};

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

  return (
    <article className={`card stack${isNew ? " topic-new" : ""}`}>
      <div className="row" style={{ alignItems: "flex-start" }}>
        <Avatar name={topic.hostName} />
        <div>
          <h3 className="topic-title">{topic.title}</h3>
          <div className="faint" style={{ fontSize: 12 }}>
            by {topic.hostName ?? hostLabel}
          </div>
        </div>
        {isNew ? (
          <>
            <span style={{ flex: 1 }} />
            <span className="pill pill-new">New</span>
          </>
        ) : null}
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

      <div className="card-actions">
        {perms.canHeart ? (
          <HeartButton
            topicId={topic.id}
            hearted={topic.viewerHasHearted}
            count={topic.heartCount}
          />
        ) : (
          <span className="heart-btn" aria-hidden>
            <span className="ic">{"♥"}</span>
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

      <CommentList
        comments={publicComments}
        canReply={perms.canComment}
        canModerate={perms.canModerate}
      />

      {perms.canComment ? <CommentComposer topicId={topic.id} /> : null}

      {perms.canHostOnly && topic.weightedScore != null ? (
        <HostInsightsPanel
          weightedScore={topic.weightedScore}
          heartCount={topic.heartCount}
          weightedBreakdown={topic.weightedBreakdown ?? []}
        />
      ) : null}

      {perms.canHostOnly ? (
        <HostOnlyPanel
          topicId={topic.id}
          comments={hostComments}
          canModerate={perms.canModerate}
        />
      ) : null}

      {isOwner && !perms.canModerate ? (
        <HostTopicActions
          topic={{
            id: topic.id,
            title: topic.title,
            bodyMd: topic.bodyMd,
            coverImageUrl: topic.coverImageUrl,
            status: topic.status,
          }}
          slug={slug}
          label={hostLabel}
        />
      ) : null}

      {perms.canModerate ? (
        <AdminTopicActions
          topic={{
            id: topic.id,
            title: topic.title,
            bodyMd: topic.bodyMd,
            coverImageUrl: topic.coverImageUrl,
          }}
          slug={slug}
          label={adminLabel}
          hosts={hosts}
          currentHostId={topic.hostId}
        />
      ) : null}
    </article>
  );
}
