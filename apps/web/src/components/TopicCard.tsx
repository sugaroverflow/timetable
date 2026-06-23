import type { FeedTopic } from "@/lib/feedTypes";

import { AdminTopicActions } from "./AdminTopicActions";
import { Avatar } from "./Avatar";
import { CommentComposer } from "./CommentComposer";
import { CommentList } from "./CommentList";
import { HeartButton } from "./HeartButton";

export type FeedPerms = {
  canHeart: boolean;
  canComment: boolean;
  canHostOnly: boolean;
  canModerate: boolean;
};

export function TopicCard({
  topic,
  perms,
}: {
  topic: FeedTopic;
  perms: FeedPerms;
}) {
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
              by {topic.hostName ?? "Host"}
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
            <span className="ic">{"\u2665"}</span>
            {topic.heartCount}
          </span>
        )}
      </div>

      <div
        className="topic-body"
        dangerouslySetInnerHTML={{ __html: topic.bodyHtml }}
      />

      {topic.weightedScore != null && topic.weightedBreakdown ? (
        <div className="host-panel">
          <h4>Weighted hearts — {topic.weightedScore.toFixed(2)}</h4>
          {topic.weightedBreakdown.length === 0 ? (
            <div className="faint" style={{ fontSize: 12 }}>
              No hearts yet.
            </div>
          ) : (
            topic.weightedBreakdown.map((w) => (
              <div className="weight-row" key={w.electorId}>
                <span>{w.electorName ?? "Elector"}</span>
                <span className="mono">{w.weight.toFixed(2)}</span>
              </div>
            ))
          )}
        </div>
      ) : null}

      <div className="faint" style={{ fontSize: 12 }}>
        {topic.commentCount} comment{topic.commentCount === 1 ? "" : "s"}
      </div>

      <CommentList
        comments={topic.comments}
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
