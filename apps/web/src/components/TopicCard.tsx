import Link from "next/link";

import type { FeedTopic } from "@/lib/feedTypes";
import { topicPath } from "@/lib/topicPath";
import type { RoleLabels } from "@/lib/timetableSettings";

import { AdminTopicActions } from "./AdminTopicActions";
import { Avatar } from "./Avatar";
import { CollapsibleTopicBody } from "./CollapsibleTopicBody";
import { CommentComposer } from "./CommentComposer";
import { CommentList } from "./CommentList";
import { CommentsOpenScope } from "./CommentsOpenScope";
import { CommentTeaser } from "./CommentTeaser";
import { HostOnlyPanel } from "./HostOnlyPanel";
import { HostTopicActions } from "./HostTopicActions";
import { PersonChip } from "./PersonChip";
import { TopicActionsRow } from "./TopicActionsRow";
import { TopicEditScope } from "./TopicEditScope";

export type FeedPerms = {
  canHeart: boolean;
  /** 💙 eligibility: host and NOT elector (host hearts, 2026-08-04). */
  canHostHeart: boolean;
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
        <Avatar name={topic.hostName} image={topic.hostImage} />
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

/* The collapsed panels and role-gated action rows that close out the card:
 * host-only comments, host actions, admin actions. (The ❤️ breakdown moved
 * to the actions-row disclosure — any signed-in viewer, QA 2026-07-27.) */
function TopicTail({
  topic,
  perms,
  slug,
  viewerId,
  hostLabel,
  adminLabel,
  roleLabels,
  hosts,
  hostComments,
  hostCommentsEnabled,
}: {
  topic: FeedTopic;
  perms: FeedPerms;
  slug: string;
  viewerId: string | null;
  hostLabel: string;
  adminLabel: string;
  roleLabels: RoleLabels;
  hosts: { id: string; name: string | null }[];
  hostComments: FeedTopic["comments"];
  hostCommentsEnabled: boolean;
}) {
  const isOwner = viewerId != null && viewerId === topic.hostId;
  const editable = {
    id: topic.id,
    title: topic.title,
    bodyMd: topic.bodyMd,
    coverImageUrl: topic.coverImageUrl,
    status: topic.status,
  };
  return (
    <>
      {perms.canHostOnly && hostCommentsEnabled ? (
        <HostOnlyPanel
          topicId={topic.id}
          comments={hostComments}
          canModerate={perms.canModerate}
          viewerId={viewerId}
          slug={slug}
          hostLabel={hostLabel}
          roleLabels={roleLabels}
          hostHearters={topic.hostHearters}
          canHostHeart={perms.canHostHeart}
          viewerHasHostHearted={topic.viewerHasHostHearted}
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

/** The actions slot: queue mode swaps the normal heart/comment row for the
 * big decision buttons — one call to action per card. */
function ActionsSlot({
  topic,
  perms,
  slug,
  viewerId,
  viewerHeartCount,
  electorLabel,
  queueControls,
}: {
  topic: FeedTopic;
  perms: FeedPerms;
  slug: string;
  viewerId: string | null;
  viewerHeartCount: number | null;
  electorLabel: string;
  queueControls: React.ReactNode;
}) {
  if (queueControls) return <>{queueControls}</>;
  return (
    <TopicActionsRow
      topicId={topic.id}
      slug={slug}
      heartCount={topic.heartCount}
      viewerHasHearted={topic.viewerHasHearted}
      commentCount={topic.commentCount}
      canHeart={perms.canHeart}
      signedIn={viewerId != null}
      viewerHeartCount={viewerHeartCount}
      electorLabel={electorLabel}
    />
  );
}

/** The public discussion (dialogue-first threading, 2026-08-13): the
 * top-composer starts a new strand and is ALWAYS visible; chains render
 * newest first, each ending in its tail composer. Feed and queue cards
 * collapse the tree below the composer behind the comment-teaser (new
 * top-level previews + a "💬 n comments" pill); the permalink page keeps
 * everything open. */
function CommentSection({
  topic,
  perms,
  slug,
  publicComments,
  open,
  viewerId,
  roleLabels,
}: {
  topic: FeedTopic;
  perms: FeedPerms;
  slug: string;
  publicComments: FeedTopic["comments"];
  open: boolean;
  viewerId: string | null;
  roleLabels: RoleLabels;
}) {
  if (!perms.canComment && publicComments.length === 0) return null;
  const thread = (
    <CommentList
      comments={publicComments}
      canReply={perms.canComment}
      canModerate={perms.canModerate}
      viewerId={viewerId}
      slug={slug}
      roleLabels={roleLabels}
    />
  );
  return (
    <div className="comment-section">
      {perms.canComment ? (
        <CommentComposer topicId={topic.id} mentionSlug={slug} />
      ) : null}
      {open ? (
        thread
      ) : (
        <CommentTeaser
          topicId={topic.id}
          comments={publicComments}
          seenAt={topic.viewerCommentsSeenAt}
        >
          {thread}
        </CommentTeaser>
      )}
    </div>
  );
}

/** Collapsed by default; the Topic Queue shows the whole body. */
function TopicBody({ html, expand }: { html: string; expand: boolean }) {
  if (expand) {
    return (
      <div className="topic-body" dangerouslySetInnerHTML={{ __html: html }} />
    );
  }
  return <CollapsibleTopicBody html={html} />;
}

/** The card's content block (head, cover, body) — what TopicEditScope
 * swaps for the edit form while editing. */
function TopicContent({
  topic,
  slug,
  hostLabel,
  isNew,
  expandBody,
  permalink,
}: {
  topic: FeedTopic;
  slug: string;
  hostLabel: string;
  isNew: boolean;
  expandBody: boolean;
  permalink: string | null;
}) {
  return (
    <>
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

      <TopicBody html={topic.bodyHtml} expand={expandBody} />
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
  electorLabel,
  viewerHeartCount = null,
  hosts = [],
  hostCommentsEnabled,
  expandBody = false,
  queueControls = null,
  discussionOpen = false,
}: {
  topic: FeedTopic;
  perms: FeedPerms;
  slug: string;
  viewerId?: string | null;
  isNew?: boolean;
  hostLabel?: string;
  adminLabel?: string;
  electorLabel: string;
  viewerHeartCount?: number | null;
  hosts?: { id: string; name: string | null }[];
  /** Forum option: the host-only thread (and 💙 row) — off hides both. */
  hostCommentsEnabled: boolean;
  /** Full body, no collapse — the Topic Queue shows one topic at a time,
   * and deciding needs the whole thing. */
  expandBody?: boolean;
  /** Queue mode: rendered in the actions slot INSTEAD of the normal
   * heart/comment row (one call to action per card), with the comments
   * folded below it. */
  queueControls?: React.ReactNode;
  /** Permalink page: the discussion renders fully open instead of behind
   * the comment-teaser (dialogue-first threading, 2026-08-13). */
  discussionOpen?: boolean;
}) {
  const publicComments = topic.comments.filter(
    (c) => c.visibility !== "host_only",
  );
  const hostComments = topic.comments.filter(
    (c) => c.visibility === "host_only",
  );
  const permalink = topicPath(slug, topic.hostSlug, topic.slug, topic.hostId);
  // The card's label props are the forum's resolved role labels — reshape
  // them for the comment threads' author role pills.
  const roleLabels: RoleLabels = {
    admin: adminLabel,
    host: hostLabel,
    elector: electorLabel,
  };

  return (
    <article className={`card stack${isNew ? " topic-new" : ""}`}>
      {/* While editing, the scope swaps this content block for the edit
          form in place (QA 2026-07-29) — the Edit buttons live in the
          tail below and drive it via context. */}
      <TopicEditScope
        topic={{
          id: topic.id,
          title: topic.title,
          bodyMd: topic.bodyMd,
          coverImageUrl: topic.coverImageUrl,
        }}
        slug={slug}
        content={
          <TopicContent
            topic={topic}
            slug={slug}
            hostLabel={hostLabel}
            isNew={isNew}
            expandBody={expandBody}
            permalink={permalink}
          />
        }
      >
        {/* comments-open-scope: the 💬 button and top-composer unfold the
            teaser below them (QA 2026-08-13). */}
        <CommentsOpenScope>
          <ActionsSlot
            topic={topic}
            perms={perms}
            slug={slug}
            viewerId={viewerId}
            viewerHeartCount={viewerHeartCount}
            electorLabel={electorLabel}
            queueControls={queueControls}
          />

          <CommentSection
            topic={topic}
            perms={perms}
            slug={slug}
            publicComments={publicComments}
            open={discussionOpen}
            viewerId={viewerId}
            roleLabels={roleLabels}
          />
        </CommentsOpenScope>

        <TopicTail
          topic={topic}
          perms={perms}
          slug={slug}
          viewerId={viewerId}
          hostLabel={hostLabel}
          adminLabel={adminLabel}
          roleLabels={roleLabels}
          hosts={hosts}
          hostComments={hostComments}
          hostCommentsEnabled={hostCommentsEnabled}
        />
      </TopicEditScope>
    </article>
  );
}
