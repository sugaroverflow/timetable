import { and, asc, desc, eq, isNull } from "drizzle-orm";

import {
  comments,
  db,
  topics,
  users,
  type Comment,
  type CommentVisibility,
} from "@timetable/db";

import { logActivity } from "./activity";

/** Comments are logged to the activity feed (QA #42); the snippet lets the
 * timeline show what was said without a second lookup. */
async function logCommentActivity(
  comment: Comment,
  action: "comment.add" | "comment.reply",
): Promise<void> {
  const [topic] = await db
    .select({ id: topics.id, title: topics.title, timetableId: topics.timetableId })
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

/** Latest visible host-only note on a topic (e.g. admin "request changes" feedback). */
export async function getLatestHostOnlyComment(
  topicId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ body: comments.body })
    .from(comments)
    .where(
      and(
        eq(comments.topicId, topicId),
        eq(comments.visibility, "host_only"),
        isNull(comments.hiddenAt),
      ),
    )
    .orderBy(desc(comments.createdAt))
    .limit(1);
  return row?.body ?? null;
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

/** Threaded comments for a topic, filtered by the viewer's visibility scope. */
export async function listCommentTree(
  topicId: string,
  opts: { includeHostOnly: boolean; includeHidden: boolean },
): Promise<CommentNode[]> {
  const conds = [eq(comments.topicId, topicId)];
  if (!opts.includeHostOnly) conds.push(eq(comments.visibility, "public"));
  if (!opts.includeHidden) conds.push(isNull(comments.hiddenAt));

  const rows = await db
    .select({
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
