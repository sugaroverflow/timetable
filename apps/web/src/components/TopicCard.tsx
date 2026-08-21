import Link from "next/link";

import type { WorkbenchCalendar } from "@/lib/calendarTypes";
import type { FeedTopic } from "@/lib/feedTypes";
import { topicPath } from "@/lib/topicPath";
import { pluralLabel, type RoleLabels } from "@/lib/timetableSettings";

import { countNested } from "@/lib/commentTree";

import { AdminCommentsBody } from "./AdminCommentsPanel";
import { AdminTopicActions } from "./AdminTopicActions";
import { Avatar } from "./Avatar";
import { TopicTabs, type TopicTab } from "./TopicTabs";
import { CollapsibleTopicBody } from "./CollapsibleTopicBody";
import { CommentComposer } from "./CommentComposer";
import { CommentList } from "./CommentList";
import { CommentsOpenScope } from "./CommentsOpenScope";
import { CommentTeaser } from "./CommentTeaser";
import { HostOnlyThreadBody } from "./HostOnlyThreadBody";
import { HostTopicActions } from "./HostTopicActions";
import { PersonChip } from "./PersonChip";
import { SessionsTabBody } from "./SessionsTabBody";
import { TopicActionsRow } from "./TopicActionsRow";
import { TopicEditScope } from "./TopicEditScope";

export type FeedPerms = {
  canHeart: boolean;
  /** 💙 eligibility: host and NOT elector (host hearts, 2026-08-04). */
  canHostHeart: boolean;
  canComment: boolean;
  canHostOnly: boolean;
  canModerate: boolean;
  /** The drafting thread's tab: the topic's own host, or any admin. */
  canSeeAdminThread: boolean;
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

/* The role-gated action rows that close out the card: host actions, admin
 * actions. (The ❤️ breakdown moved to the actions-row disclosure — any
 * signed-in viewer, QA 2026-07-27; the host-only thread moved into the
 * topic-tabs, 2026-08-14.) */
function TopicTail({
  topic,
  perms,
  slug,
  viewerId,
  hostLabel,
  adminLabel,
  hosts,
}: {
  topic: FeedTopic;
  perms: FeedPerms;
  slug: string;
  viewerId: string | null;
  hostLabel: string;
  adminLabel: string;
  hosts: { id: string; name: string | null }[];
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

/** The ❤️ row, which now leads the Comments tab (QA 2026-08-15). Queue
 * mode has none: its big decision buttons stand above the strip instead,
 * keeping one call to action per card. */
function FeedActionsRow({
  topic,
  perms,
  slug,
  viewerId,
  viewerHeartCount,
  electorLabel,
}: {
  topic: FeedTopic;
  perms: FeedPerms;
  slug: string;
  viewerId: string | null;
  viewerHeartCount: number | null;
  electorLabel: string;
}) {
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
  topicHref,
}: {
  topic: FeedTopic;
  perms: FeedPerms;
  slug: string;
  publicComments: FeedTopic["comments"];
  open: boolean;
  viewerId: string | null;
  roleLabels: RoleLabels;
  topicHref?: string | null;
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
      topicHref={topicHref}
      // The topic's author curates their public discussion (#258).
      topicHostId={topic.hostId}
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

/** The card's tabs: the public discussion always, the {host}-only thread
 * for host/admin viewers when the forum option is on, the drafting thread
 * for the owner and admins, the topic's sessions when it has any. One tab
 * renders bare — exactly the pre-tabs card; two make the strip.
 *
 * The tabs sit ABOVE the action bars, not below (Ed, QA 2026-08-15): each
 * heart lives inside its own thread — ❤️ leading the Comments tab, 💙
 * leading the {host}-only tab — so a viewer meets exactly one action bar
 * at a time, and its 💬 count is unambiguously that thread's. This is why
 * the Comments tab is unconditional: it carries the ❤️. */
type TabArgs = {
  topic: FeedTopic;
  perms: FeedPerms;
  slug: string;
  publicComments: FeedTopic["comments"];
  hostComments: FeedTopic["comments"];
  discussionOpen: boolean;
  viewerId: string | null;
  hostLabel: string;
  adminLabel: string;
  roleLabels: RoleLabels;
  hostCommentsEnabled: boolean;
  /** The forum's calendar context for the Sessions tab's rows, or null
   * when the calendar is off. */
  calendar: WorkbenchCalendar | null;
  /** The ❤️ row — null in queue mode, where the decision buttons stand
   * above the strip as the card's one call to action. */
  actionsRow: React.ReactNode;
  /** Topic permalink — the comment timestamps' link target (#259). */
  permalink: string | null;
};

/** Unconditional: it carries the ❤️ row, so every card has it. */
function commentsTab(a: TabArgs): TopicTab {
  const count = countNested(a.publicComments);
  return {
    value: "comments",
    icon: "comments",
    text: "Comments",
    badge: count > 0 ? `(${count})` : undefined,
    pane: (
      <>
        {a.actionsRow}
        <CommentSection
          topic={a.topic}
          perms={a.perms}
          slug={a.slug}
          publicComments={a.publicComments}
          open={a.discussionOpen}
          viewerId={a.viewerId}
          roleLabels={a.roleLabels}
          topicHref={a.permalink}
        />
      </>
    ),
  };
}

function hostTab(a: TabArgs): TopicTab | null {
  if (!a.perms.canHostOnly || !a.hostCommentsEnabled) return null;
  const count = countNested(a.hostComments);
  const hearts = a.topic.hostHearters?.length ?? 0;
  return {
    value: "host",
    icon: "host",
    text: `${a.hostLabel}-only`,
    badge:
      [count > 0 ? `(${count})` : null, hearts > 0 ? `💙 ${hearts}` : null]
        .filter(Boolean)
        .join(" · ") || undefined,
    pane: (
      <HostOnlyThreadBody
        topicId={a.topic.id}
        comments={a.hostComments}
        canModerate={a.perms.canModerate}
        viewerId={a.viewerId}
        slug={a.slug}
        hostLabel={a.hostLabel}
        roleLabels={a.roleLabels}
        hostHearters={a.topic.hostHearters}
        canHostHeart={a.perms.canHostHeart}
        viewerHasHostHearted={a.topic.viewerHasHostHearted}
        topicHref={a.permalink}
      />
    ),
  };
}

/** The drafting thread (QA 2026-08-15): the topic owner's private line to
 * the admins, now on every surface where those two see the topic rather
 * than only My Topics and the permalink — a tab that comes and goes by
 * surface is a tab you go looking for. The API serves the data to nobody
 * else, so this gate only mirrors it. */
function adminTab(a: TabArgs): TopicTab | null {
  if (!a.perms.canSeeAdminThread) return null;
  const comments = a.topic.adminComments ?? [];
  const count = countNested(comments);
  return {
    value: "admin",
    icon: "admin",
    text: pluralLabel(a.adminLabel),
    badge: count > 0 ? `(${count})` : undefined,
    pane: (
      <AdminCommentsBody
        topicId={a.topic.id}
        comments={comments}
        canModerate={a.perms.canModerate}
        viewerId={a.viewerId}
        slug={a.slug}
        adminLabel={a.adminLabel}
        roleLabels={a.roleLabels}
        topicHref={a.permalink}
      />
    ),
  };
}

/** sessions-tab (2026-08-14; calendar rows since 2026-08-16): where this
 * topic is pencilled/confirmed on future slots — for every viewer of the
 * card, since sessions are public on the calendar page. The rows are
 * calendar rows, so what each viewer gets there is what the calendar page
 * would give them. */
function sessionsTab(a: TabArgs): TopicTab | null {
  if (a.topic.sessionSlotCount === 0) return null;
  return {
    value: "schedule",
    icon: "schedule",
    text: "Sessions",
    badge: `(${a.topic.sessionSlotCount})`,
    pane: (
      <SessionsTabBody
        slug={a.slug}
        topicId={a.topic.id}
        calendar={a.calendar}
        adminLabel={a.adminLabel}
        roleLabels={a.roleLabels}
      />
    ),
  };
}

function buildTopicTabs(args: TabArgs): TopicTab[] {
  return [
    commentsTab(args),
    hostTab(args),
    adminTab(args),
    sessionsTab(args),
  ].filter((s): s is TopicTab => s !== null);
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

/* Element order (QA #42, revised 2026-08-15): title, author, cover,
 * description, then the topic-tabs strip — and INSIDE the open tab its own
 * action bar (❤️ + 💬 on Comments, 💙 + 💬 on {host}-only) above that
 * thread's composer and comments — then host actions, admin actions. The
 * strip sits above the action bars, so only one is ever on screen. */
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
  calendar,
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
  /** Calendar context for the Sessions tab (2026-08-16): its rows are
   * calendar rows now. Null = the forum has no calendar, so no tab. */
  calendar: WorkbenchCalendar | null;
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
            teaser below them (QA 2026-08-13) — and switch the strip back
            to Comments, which matters for the queue's decision buttons and
            for deep links now that the ❤️ row lives inside that tab. The
            {host}-only thread's own 💬 overrides the click, so it never
            drags you out of its tab. */}
        <CommentsOpenScope>
          {queueControls}

          <TopicTabs
            topicId={topic.id}
            followCommentsOpen
            tabs={buildTopicTabs({
              topic,
              perms,
              slug,
              publicComments,
              hostComments,
              discussionOpen,
              viewerId,
              hostLabel,
              adminLabel,
              roleLabels,
              hostCommentsEnabled,
              calendar,
              permalink,
              actionsRow: queueControls ? null : (
                <FeedActionsRow
                  topic={topic}
                  perms={perms}
                  slug={slug}
                  viewerId={viewerId}
                  viewerHeartCount={viewerHeartCount}
                  electorLabel={electorLabel}
                />
              ),
            })}
          />
        </CommentsOpenScope>

        <TopicTail
          topic={topic}
          perms={perms}
          slug={slug}
          viewerId={viewerId}
          hostLabel={hostLabel}
          adminLabel={adminLabel}
          hosts={hosts}
        />
      </TopicEditScope>
    </article>
  );
}
