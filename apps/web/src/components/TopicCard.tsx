import type { FeedTopic } from "@/lib/feedTypes";

import { AdminTopicActions } from "./AdminTopicActions";
import { Avatar } from "./Avatar";
import { CommentComposer } from "./CommentComposer";
import { CommentList } from "./CommentList";
import { HeartButton } from "./HeartButton";
import { HostInsightsPanel } from "./HostInsightsPanel";

export type FeedPerms = {
  canHeart: boolean;
  canComment: boolean;
  canHostOnly: boolean;
  canModerate: boolean;
};

export function TopicCard({
  topic,
  perms,
  hostLabel = "Host",
}: {
  topic: FeedTopic;
  perms: FeedPerms;
  hostLabel?: string;
}) {
  const publicComments = topic.comments.filter(
    (c) => c.visibility !== "host_only",
  );
  const hostComments = topic.comments.filter(
    (c) => c.visibility === "host_only",
  );

  return (
    <article className="card stack">
      <div
        className="row"
        style={{ justifyContent: "space-between", alignItems: "flex-start" }}
      >
        <div className="row">
          <Avatar name={topic.hostName} />
          <div>
            <h3 className="topic-title">{topic.title}</h3>
            <div className="faint" style={{ fontSize: 12 }}>
              by {topic.hostName ?? hostLabel}
            </div>
          </div>
        </div>
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
      </div>

      <div
        className="topic-body"
        dangerouslySetInnerHTML={{ __html: topic.bodyHtml }}
      />

      {topic.coverImageUrl ? (
        <div
          className="topic-cover"
          style={{ backgroundImage: `url(${topic.coverImageUrl})` }}
          aria-label={`${topic.title} cover image`}
        />
      ) : null}

      {perms.canHostOnly && topic.weightedScore != null ? (
        <HostInsightsPanel
          weightedScore={topic.weightedScore}
          heartCount={topic.heartCount}
          weightedBreakdown={topic.weightedBreakdown ?? []}
          hostComments={hostComments}
        />
      ) : null}

      <div className="faint" style={{ fontSize: 12 }}>
        {topic.commentCount} comment{topic.commentCount === 1 ? "" : "s"}
      </div>

      <CommentList
        comments={publicComments}
        canReply={perms.canComment}
        canModerate={perms.canModerate}
      />

      {perms.canComment ? (
        <CommentComposer topicId={topic.id} canHostOnly={perms.canHostOnly} />
      ) : null}

      {perms.canModerate ? <AdminTopicActions topicId={topic.id} /> : null}
    </article>
  );
}
