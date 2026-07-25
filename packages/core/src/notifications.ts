import { and, desc, eq, gt, isNotNull, isNull, ne, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import {
  commentMentions,
  comments,
  db,
  timetableMemberships,
  topics,
} from "@timetable/db";

/** One entry in the notifications pane (QA #59): a comment on one of the
 * viewer's topics, a reply to one of the viewer's comments, or a comment that
 * @mentions the viewer (product feedback round 1). */
export type NotificationItem = {
  commentId: string;
  kind: "reply" | "comment" | "mention";
  authorId: string;
  authorName: string | null;
  authorImage: string | null;
  body: string;
  visibility: string;
  createdAt: Date;
  topicId: string;
  topicTitle: string;
  topicSlug: string | null;
  topicHostSlug: string | null;
};

/**
 * Comments on the viewer's topics + replies to the viewer's comments,
 * newest first. The viewer authored neither; hidden comments excluded.
 */
export async function listNotifications(
  timetableId: string,
  userId: string,
  limit = 50,
): Promise<NotificationItem[]> {
  const parents = alias(comments, "parent_comments");
  // Per-forum profiles: author and host display fields come from their
  // memberships in this timetable (left joins — ex-members render null).
  const hostMembers = alias(timetableMemberships, "host_memberships");
  const authorMembers = alias(timetableMemberships, "author_memberships");
  const mentions = alias(commentMentions, "viewer_mentions");

  const rows = await db
    .select({
      commentId: comments.id,
      parentAuthorId: parents.authorId,
      topicHostId: topics.hostId,
      mentionUserId: mentions.userId,
      authorId: comments.authorId,
      authorName: authorMembers.name,
      authorImage: authorMembers.image,
      body: comments.body,
      visibility: comments.visibility,
      createdAt: comments.createdAt,
      topicId: topics.id,
      topicTitle: topics.title,
      topicSlug: topics.slug,
      topicHostSlug: hostMembers.slug,
    })
    .from(comments)
    .innerJoin(topics, eq(topics.id, comments.topicId))
    .leftJoin(
      hostMembers,
      and(
        eq(hostMembers.userId, topics.hostId),
        eq(hostMembers.timetableId, topics.timetableId),
      ),
    )
    .leftJoin(
      authorMembers,
      and(
        eq(authorMembers.userId, comments.authorId),
        eq(authorMembers.timetableId, topics.timetableId),
      ),
    )
    .leftJoin(parents, eq(parents.id, comments.parentId))
    .leftJoin(
      mentions,
      and(eq(mentions.commentId, comments.id), eq(mentions.userId, userId)),
    )
    .where(
      and(
        eq(topics.timetableId, timetableId),
        ne(comments.authorId, userId),
        isNull(comments.hiddenAt),
        or(
          eq(topics.hostId, userId),
          eq(parents.authorId, userId),
          isNotNull(mentions.userId),
        ),
      ),
    )
    .orderBy(desc(comments.createdAt))
    .limit(limit);

  return rows.map((r) => ({
    commentId: r.commentId,
    kind:
      r.parentAuthorId === userId
        ? "reply"
        : r.topicHostId === userId
          ? "comment"
          : "mention",
    authorId: r.authorId,
    authorName: r.authorName,
    authorImage: r.authorImage,
    body: r.body,
    visibility: r.visibility,
    createdAt: r.createdAt,
    topicId: r.topicId,
    topicTitle: r.topicTitle,
    topicSlug: r.topicSlug,
    topicHostSlug: r.topicHostSlug,
  }));
}

/** Unread notifications since the member's watermark (null = all unread). */
export async function countUnreadNotifications(
  timetableId: string,
  userId: string,
): Promise<number> {
  const [membership] = await db
    .select({ seenAt: timetableMemberships.lastSeenNotificationsAt })
    .from(timetableMemberships)
    .where(
      and(
        eq(timetableMemberships.userId, userId),
        eq(timetableMemberships.timetableId, timetableId),
      ),
    )
    .limit(1);
  if (!membership) return 0;

  const parents = alias(comments, "parent_comments");
  const mentions = alias(commentMentions, "viewer_mentions");
  const conds = [
    eq(topics.timetableId, timetableId),
    ne(comments.authorId, userId),
    isNull(comments.hiddenAt),
    or(
      eq(topics.hostId, userId),
      eq(parents.authorId, userId),
      isNotNull(mentions.userId),
    ),
  ];
  if (membership.seenAt) conds.push(gt(comments.createdAt, membership.seenAt));

  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(comments)
    .innerJoin(topics, eq(topics.id, comments.topicId))
    .leftJoin(parents, eq(parents.id, comments.parentId))
    .leftJoin(
      mentions,
      and(eq(mentions.commentId, comments.id), eq(mentions.userId, userId)),
    )
    .where(and(...conds));
  return row?.n ?? 0;
}

/** Reset the unread badge — called when the member opens Notifications. */
export async function markNotificationsSeen(
  timetableId: string,
  userId: string,
): Promise<void> {
  await db
    .update(timetableMemberships)
    .set({ lastSeenNotificationsAt: new Date() })
    .where(
      and(
        eq(timetableMemberships.userId, userId),
        eq(timetableMemberships.timetableId, timetableId),
      ),
    );
}
