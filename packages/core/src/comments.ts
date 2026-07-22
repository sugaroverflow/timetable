import { and, asc, eq, inArray, isNull } from "drizzle-orm";

import { parseMentionHandles } from "@timetable/shared";

import {
  commentMentions,
  comments,
  db,
  timetableMemberships,
  topics,
  users,
  type Comment,
  type CommentVisibility,
} from "@timetable/db";

import { logActivity } from "./activity";

/**
 * Record @mentions for a public comment (product feedback round 1). Handles
 * are resolved against the timetable's members by slug; the author can't
 * mention themselves. Restricted to public comments so a mention can never
 * leak a host-only/admin-only comment body to a non-privileged member. */
async function recordMentions(comment: Comment): Promise<void> {
  if (comment.visibility !== "public") return;
  const handles = parseMentionHandles(comment.body);
  if (handles.length === 0) return;

  const [topic] = await db
    .select({ timetableId: topics.timetableId })
    .from(topics)
    .where(eq(topics.id, comment.topicId))
    .limit(1);
  if (!topic) return;

  const members = await db
    .select({ userId: users.id, slug: users.slug })
    .from(users)
    .innerJoin(timetableMemberships, eq(timetableMemberships.userId, users.id))
    .where(
      and(
        eq(timetableMemberships.timetableId, topic.timetableId),
        inArray(users.slug, handles),
      ),
    );

  const rows = members
    .filter((m) => m.userId !== comment.authorId)
    .map((m) => ({ commentId: comment.id, userId: m.userId }));
  if (rows.length === 0) return;
  await db.insert(commentMentions).values(rows).onConflictDoNothing();
}

/** Comments are logged to the activity feed (QA #42); the snippet lets the
 * timeline show what was said without a second lookup. */
async function logCommentActivity(
  comment: Comment,
  action: "comment.add" | "comment.reply",
): Promise<void> {
  const [topic] = await db
    .select({
      id: topics.id,
      title: topics.title,
      timetableId: topics.timetableId,
    })
    .from(topics)
    .where(eq(topics.id, comment.topicId))
    .limit(1);
  if (!topic) return;
  await logActivity({
    timetableId: topic.timetableId,
    actorId: comment.authorId,
    action,
    payload: {
      topicId: topic.id,
      title: topic.title,
      snippet: comment.body.slice(0, 140),
      visibility: comment.visibility,
      commentId: comment.id,
    },
  });
}

export async function getCommentById(id: string): Promise<Comment | null> {
  const [comment] = await db
    .select()
    .from(comments)
    .where(eq(comments.id, id))
    .limit(1);
  return comment ?? null;
}

export async function addComment(
  topicId: string,
  authorId: string,
  body: string,
  visibility: CommentVisibility,
): Promise<Comment> {
  const [comment] = await db
    .insert(comments)
    .values({ topicId, authorId, body, visibility })
    .returning();
  if (!comment) throw new Error("Failed to add comment");
  await logCommentActivity(comment, "comment.add");
  await recordMentions(comment);
  return comment;
}

/** Reply inherits the parent's topic and visibility. */
export async function addReply(
  parent: Comment,
  authorId: string,
  body: string,
): Promise<Comment> {
  const [comment] = await db
    .insert(comments)
    .values({
      topicId: parent.topicId,
      parentId: parent.id,
      authorId,
      body,
      visibility: parent.visibility,
    })
    .returning();
  if (!comment) throw new Error("Failed to add reply");
  await logCommentActivity(comment, "comment.reply");
  await recordMentions(comment);
  return comment;
}

export async function setCommentHidden(
  commentId: string,
  hidden: boolean,
  byUserId: string | null,
): Promise<Comment | null> {
  const [updated] = await db
    .update(comments)
    .set({
      hiddenAt: hidden ? new Date() : null,
      hiddenByUserId: hidden ? byUserId : null,
      updatedAt: new Date(),
    })
    .where(eq(comments.id, commentId))
    .returning();
  return updated ?? null;
}

export type CommentNode = {
  id: string;
  parentId: string | null;
  authorId: string;
  authorName: string | null;
  authorImage: string | null;
  body: string;
  visibility: CommentVisibility;
  hidden: boolean;
  createdAt: Date;
  replies: CommentNode[];
};

export type CommentTreeOptions = {
  includeHostOnly: boolean;
  includeHidden: boolean;
  includeAdminOnly?: boolean;
};

type CommentTreeRow = {
  topicId: string;
  id: string;
  parentId: string | null;
  authorId: string;
  authorName: string | null;
  authorImage: string | null;
  body: string;
  visibility: CommentVisibility;
  hiddenAt: Date | null;
  createdAt: Date;
};

/** The one comment-tree query, shared by the single-topic and batched
 * readers so their filters/joins/order can't drift. */
async function fetchCommentRows(
  topicIds: string[],
  opts: CommentTreeOptions,
): Promise<CommentTreeRow[]> {
  const visibilities: CommentVisibility[] = ["public"];
  if (opts.includeHostOnly) visibilities.push("host_only");
  if (opts.includeAdminOnly) visibilities.push("admin_only");
  const conds = [
    inArray(comments.topicId, topicIds),
    inArray(comments.visibility, visibilities),
  ];
  if (!opts.includeHidden) conds.push(isNull(comments.hiddenAt));

  return db
    .select({
      topicId: comments.topicId,
      id: comments.id,
      parentId: comments.parentId,
      authorId: comments.authorId,
      authorName: users.name,
      authorImage: users.image,
      body: comments.body,
      visibility: comments.visibility,
      hiddenAt: comments.hiddenAt,
      createdAt: comments.createdAt,
    })
    .from(comments)
    .innerJoin(users, eq(users.id, comments.authorId))
    .where(and(...conds))
    .orderBy(asc(comments.createdAt));
}

/** Thread one topic's rows (already in createdAt order) into a tree. */
function buildCommentTree(rows: CommentTreeRow[]): CommentNode[] {
  const nodes = new Map<string, CommentNode>();
  for (const r of rows) {
    nodes.set(r.id, {
      id: r.id,
      parentId: r.parentId,
      authorId: r.authorId,
      authorName: r.authorName,
      authorImage: r.authorImage,
      body: r.body,
      visibility: r.visibility,
      hidden: r.hiddenAt !== null,
      createdAt: r.createdAt,
      replies: [],
    });
  }

  const roots: CommentNode[] = [];
  for (const r of rows) {
    const node = nodes.get(r.id);
    if (!node) continue;
    const parent = r.parentId ? nodes.get(r.parentId) : undefined;
    if (parent) parent.replies.push(node);
    else roots.push(node);
  }
  return roots;
}

/** Threaded comments for a topic, filtered by the viewer's visibility scope.
 * admin_only (the drafting thread) is opt-in and never included by the feed
 * paths — only the Pending Topics / My Topics panels request it. */
export async function listCommentTree(
  topicId: string,
  opts: CommentTreeOptions,
): Promise<CommentNode[]> {
  return buildCommentTree(await fetchCommentRows([topicId], opts));
}

/** Batched {@link listCommentTree}: one query for a whole feed page's
 * topics, grouped into per-topic trees. Topics without comments simply have
 * no entry — callers should treat a miss as an empty thread. */
export async function listCommentTreesForTopics(
  topicIds: string[],
  opts: CommentTreeOptions,
): Promise<Map<string, CommentNode[]>> {
  if (topicIds.length === 0) return new Map();
  const rowsByTopic = new Map<string, CommentTreeRow[]>();
  for (const row of await fetchCommentRows(topicIds, opts)) {
    const list = rowsByTopic.get(row.topicId) ?? [];
    list.push(row);
    rowsByTopic.set(row.topicId, list);
  }
  const trees = new Map<string, CommentNode[]>();
  for (const [topicId, rows] of rowsByTopic) {
    trees.set(topicId, buildCommentTree(rows));
  }
  return trees;
}
