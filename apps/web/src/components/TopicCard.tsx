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
      <div className="row" style={{ alignItems: "flex-start" }}>
        <Avatar name={topic.hostName} />
        <div>
          <h3 className="topic-title">{topic.title}</h3>
          <div className="faint" style={{ fontSize: 12 }}>
            by {topic.hostName ?? hostLabel}
          </div>
        </div>
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

      <CommentList
        comments={publicComments}
        canReply={perms.canComment}
        canModerate={perms.canModerate}
      />

      {perms.canComment ? (
        <CommentComposer topicId={topic.id} canHostOnly={perms.canHostOnly} />
      ) : null}

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
        <button
          className="act"
          type="button"
          onClick={() => {
            const ta = document.querySelector<HTMLTextAreaElement>(
              `[data-topic-composer="${topic.id}"]`,
            );
            ta?.focus();
          }}
        >
          <span className="ic">💬</span>
          {topic.commentCount || ""}
          <span style={{ fontWeight: 600 }}>Comment</span>
        </button>
        <span style={{ flex: 1 }} />
      </div>

      {perms.canModerate ? <AdminTopicActions topicId={topic.id} /> : null}
    </article>
  );
}
