import { and, asc, eq, inArray, isNull } from "drizzle-orm";

import { parseMentionHandles } from "@timetable/shared";

import {
  commentMentions,
  comments,
  commentSeen,
  db,
  timetableMemberships,
  topics,
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
    .select({
      userId: timetableMemberships.userId,
      slug: timetableMemberships.slug,
    })
    .from(timetableMemberships)
    .where(
      and(
        eq(timetableMemberships.timetableId, topic.timetableId),
        inArray(timetableMemberships.slug, handles),
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

/** Bump the viewer's comments-seen watermark for one topic (dialogue-first
 * threading, 2026-08-13). Called on ENGAGEMENT — teaser expand or permalink
 * view — never on feed scrolling. */
export async function markCommentsSeen(
  userId: string,
  topicId: string,
): Promise<void> {
  await db
    .insert(commentSeen)
    .values({ topicId, userId })
    .onConflictDoUpdate({
      target: [commentSeen.topicId, commentSeen.userId],
      set: { seenAt: new Date() },
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

/** Author edit (QA 2026-07-29). Stamps editedAt — the "(edited)" marker's
 * source; updatedAt can't drive it because hide/unhide also bumps it. */
export async function updateCommentBody(
  commentId: string,
  body: string,
): Promise<Comment | null> {
  const now = new Date();
  const [updated] = await db
    .update(comments)
    .set({ body, editedAt: now, updatedAt: now })
    .where(eq(comments.id, commentId))
    .returning();
  return updated ?? null;
}

/** Author soft-delete (QA 2026-07-29): the row stays (thread shape,
 * audit), but the comment tombstones in threads when replies exist,
 * vanishes otherwise, and drops out of every count. Admin moderation
 * stays on hiddenAt — deliberately separate. */
export async function softDeleteComment(
  commentId: string,
): Promise<Comment | null> {
  const now = new Date();
  const [updated] = await db
    .update(comments)
    .set({ deletedAt: now, updatedAt: now })
    .where(eq(comments.id, commentId))
    .returning();
  return updated ?? null;
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
  if (!updated) return null;
  // Moderation is audit-worthy: log the hide/unhide with the same topic +
  // snippet shape as comment.add so the timeline can show and link it.
  const [topic] = await db
    .select({ title: topics.title, timetableId: topics.timetableId })
    .from(topics)
    .where(eq(topics.id, updated.topicId))
    .limit(1);
  if (topic) {
    await logActivity({
      timetableId: topic.timetableId,
      actorId: byUserId,
      action: hidden ? "comment.hide" : "comment.unhide",
      payload: {
        topicId: updated.topicId,
        title: topic.title,
        snippet: updated.body.slice(0, 140),
        commentId: updated.id,
      },
    });
  }
  return updated;
}

/** Pin/unpin by the topic's author (#258, 2026-08-17). Caller enforces the
 * gate (author + top-level); this just stamps and logs. Logged with the
 * same topic + snippet payload shape as comment.hide so the activity
 * timeline links it to the comment. */
export async function setCommentPinned(
  commentId: string,
  pinned: boolean,
  byUserId: string,
): Promise<Comment | null> {
  const [updated] = await db
    .update(comments)
    .set({
      pinnedAt: pinned ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(eq(comments.id, commentId))
    .returning();
  if (!updated) return null;
  const [topic] = await db
    .select({ title: topics.title, timetableId: topics.timetableId })
    .from(topics)
    .where(eq(topics.id, updated.topicId))
    .limit(1);
  if (topic) {
    await logActivity({
      timetableId: topic.timetableId,
      actorId: byUserId,
      action: pinned ? "comment.pin" : "comment.unpin",
      payload: {
        topicId: updated.topicId,
        title: topic.title,
        snippet: updated.body.slice(0, 140),
        commentId: updated.id,
      },
    });
  }
  return updated;
}

export type CommentNode = {
  id: string;
  parentId: string | null;
  authorId: string;
  authorName: string | null;
  authorImage: string | null;
  /** The author's roles in the topic's forum (role pill next to the name);
   * empty for ex-members and tombstones. */
  authorRoles: string[];
  body: string;
  visibility: CommentVisibility;
  hidden: boolean;
  /** Author-deleted tombstone: body/author are blanked server-side; it only
   * survives in the tree at all when replies hang off it. */
  deleted: boolean;
  editedAt: Date | null;
  /** Pinned by the topic's author (#258) — top-level comments only. The
   * tree stays newest-first regardless (teasers and digests read "latest"
   * off it); pinned-first ordering is the thread renderer's job. */
  pinnedAt: Date | null;
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
  authorRoles: string[] | null;
  body: string;
  visibility: CommentVisibility;
  hiddenAt: Date | null;
  deletedAt: Date | null;
  editedAt: Date | null;
  pinnedAt: Date | null;
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

  // Author profile comes from the author's membership in the topic's
  // timetable (per-forum profiles); left join so comments survive their
  // author leaving the forum.
  return db
    .select({
      topicId: comments.topicId,
      id: comments.id,
      parentId: comments.parentId,
      authorId: comments.authorId,
      authorName: timetableMemberships.name,
      authorImage: timetableMemberships.image,
      authorRoles: timetableMemberships.roles,
      body: comments.body,
      visibility: comments.visibility,
      hiddenAt: comments.hiddenAt,
      deletedAt: comments.deletedAt,
      editedAt: comments.editedAt,
      pinnedAt: comments.pinnedAt,
      createdAt: comments.createdAt,
    })
    .from(comments)
    .innerJoin(topics, eq(topics.id, comments.topicId))
    .leftJoin(
      timetableMemberships,
      and(
        eq(timetableMemberships.userId, comments.authorId),
        eq(timetableMemberships.timetableId, topics.timetableId),
      ),
    )
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
      authorRoles: r.authorRoles ?? [],
      body: r.body,
      visibility: r.visibility,
      hidden: r.hiddenAt !== null,
      deleted: r.deletedAt !== null,
      editedAt: r.editedAt,
      pinnedAt: r.pinnedAt,
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
  // Dialogue-first threading (2026-08-13): newest top-level comment first —
  // the composer sits at the top of the stack, so a fresh comment appears
  // right where it was typed. Replies keep input (createdAt asc) order:
  // chains read downward as dialogues.
  roots.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return pruneDeleted(roots);
}

/** Author-deleted comments (QA 2026-07-29): drop them from the tree unless
 * replies survive beneath — then keep a tombstone with body and author
 * blanked HERE, server-side, so deleted text never reaches a client.
 * Bottom-up, so a deleted chain with no live leaves vanishes entirely. */
function pruneDeleted(nodes: CommentNode[]): CommentNode[] {
  const out: CommentNode[] = [];
  for (const node of nodes) {
    node.replies = pruneDeleted(node.replies);
    if (node.deleted) {
      if (node.replies.length === 0) continue;
      node.body = "";
      node.authorId = "";
      node.authorName = null;
      node.authorImage = null;
      node.authorRoles = [];
    }
    out.push(node);
  }
  return out;
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
