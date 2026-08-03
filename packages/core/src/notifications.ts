import {
  and,
  desc,
  eq,
  gt,
  inArray,
  isNotNull,
  isNull,
  ne,
  or,
  sql,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import {
  activityEvents,
  commentMentions,
  comments,
  db,
  hearts,
  timetableMemberships,
  topics,
} from "@timetable/db";

/** One entry in the notifications pane (QA #59): a comment on one of the
 * viewer's topics, a reply to one of the viewer's comments, a comment that
 * @mentions the viewer, or — calendar v2 (QA 2026-08-03) — a session
 * pencilled/confirmed/cleared for a topic the viewer ❤️'d. For session
 * kinds, `commentId` is the activity-event id and `body` carries the slot's
 * startsAt ISO for the pane to format. */
export type NotificationItem = {
  commentId: string;
  kind:
    | "reply"
    | "comment"
    | "mention"
    | "session_pencilled"
    | "session_confirmed"
    | "session_cleared";
  authorId: string;
  authorName: string | null;
  authorImage: string | null;
  /** The author's roles in this forum (for the notifications filter,
   * 2026-07-29); empty for ex-members. */
  authorRoles: string[];
  body: string;
  visibility: string;
  createdAt: Date;
  topicId: string;
  topicTitle: string;
  topicSlug: string | null;
  topicHostSlug: string | null;
};

const SESSION_ACTIONS = ["slot.pencil", "slot.confirm", "slot.clear"];

const SESSION_KIND: Record<
  string,
  "session_pencilled" | "session_confirmed" | "session_cleared"
> = {
  "slot.pencil": "session_pencilled",
  "slot.confirm": "session_confirmed",
  "slot.clear": "session_cleared",
};

/** Session lifecycle events (calendar v2) for topics the viewer ❤️'d,
 * derived from the activity log the slot mutations write. */
async function listSessionNotifications(
  timetableId: string,
  userId: string,
  limit: number,
): Promise<NotificationItem[]> {
  const actorMembers = alias(timetableMemberships, "actor_memberships");
  const hostMembers = alias(timetableMemberships, "host_memberships");

  const rows = await db
    .select({
      id: activityEvents.id,
      action: activityEvents.action,
      actorId: activityEvents.actorId,
      authorName: actorMembers.name,
      authorRoles: actorMembers.roles,
      authorImage: actorMembers.image,
      payload: activityEvents.payload,
      createdAt: activityEvents.createdAt,
      topicId: topics.id,
      topicTitle: topics.title,
      topicSlug: topics.slug,
      topicHostSlug: hostMembers.slug,
    })
    .from(activityEvents)
    // payload.topicId is text; topics.id is uuid — compare as text.
    .innerJoin(
      topics,
      sql`${topics.id}::text = ${activityEvents.payload}->>'topicId'`,
    )
    .innerJoin(
      hearts,
      and(eq(hearts.topicId, topics.id), eq(hearts.userId, userId)),
    )
    .leftJoin(
      actorMembers,
      and(
        eq(actorMembers.userId, activityEvents.actorId),
        eq(actorMembers.timetableId, timetableId),
      ),
    )
    .leftJoin(
      hostMembers,
      and(
        eq(hostMembers.userId, topics.hostId),
        eq(hostMembers.timetableId, timetableId),
      ),
    )
    .where(
      and(
        eq(activityEvents.timetableId, timetableId),
        inArray(activityEvents.action, SESSION_ACTIONS),
        or(isNull(activityEvents.actorId), ne(activityEvents.actorId, userId)),
      ),
    )
    .orderBy(desc(activityEvents.createdAt))
    .limit(limit);

  return rows.map((r) => ({
    commentId: r.id,
    kind: SESSION_KIND[r.action] ?? "session_pencilled",
    authorId: r.actorId ?? "",
    authorName: r.authorName,
    authorRoles: (r.authorRoles ?? []) as string[],
    authorImage: r.authorImage,
    body: String((r.payload as { startsAt?: string } | null)?.startsAt ?? ""),
    visibility: "public",
    createdAt: r.createdAt,
    topicId: r.topicId,
    topicTitle: r.topicTitle,
    topicSlug: r.topicSlug,
    topicHostSlug: r.topicHostSlug,
  }));
}

/**
 * Comments on the viewer's topics + replies to the viewer's comments +
 * session events on ❤️'d topics, newest first. The viewer authored none of
 * them; hidden comments excluded.
 */
export async function listNotifications(
  timetableId: string,
  userId: string,
  limit = 50,
): Promise<NotificationItem[]> {
  const sessions = await listSessionNotifications(timetableId, userId, limit);
  const commentItems = await listCommentNotifications(
    timetableId,
    userId,
    limit,
  );
  return [...commentItems, ...sessions]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, limit);
}

async function listCommentNotifications(
  timetableId: string,
  userId: string,
  limit: number,
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
      authorRoles: authorMembers.roles,
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
        isNull(comments.deletedAt),
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
    authorRoles: (r.authorRoles ?? []) as string[],
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
    isNull(comments.deletedAt),
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

  // Session events on ❤️'d topics count too (calendar v2, QA 2026-08-03).
  const sessionConds = [
    eq(activityEvents.timetableId, timetableId),
    inArray(activityEvents.action, SESSION_ACTIONS),
    or(isNull(activityEvents.actorId), ne(activityEvents.actorId, userId)),
  ];
  if (membership.seenAt) {
    sessionConds.push(gt(activityEvents.createdAt, membership.seenAt));
  }
  const [sessionRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(activityEvents)
    .innerJoin(
      topics,
      sql`${topics.id}::text = ${activityEvents.payload}->>'topicId'`,
    )
    .innerJoin(
      hearts,
      and(eq(hearts.topicId, topics.id), eq(hearts.userId, userId)),
    )
    .where(and(...sessionConds));

  return (row?.n ?? 0) + (sessionRow?.n ?? 0);
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
