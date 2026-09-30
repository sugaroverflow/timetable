import {
  and,
  arrayOverlaps,
  asc,
  desc,
  eq,
  gt,
  inArray,
  isNotNull,
  isNull,
  lt,
  ne,
  or,
  sql,
} from "drizzle-orm";

import { alias } from "drizzle-orm/pg-core";

import { parseMentionHandles, type Role } from "@timetable/shared";

import {
  db,
  loungeComments,
  loungeMentions,
  loungeReactions,
  timetableMemberships,
  type LoungeComment,
} from "@timetable/db";

import { logActivity } from "./activity";

/**
 * The {host} Lounge (docs/host-lounge-plan.md, 2026-09-30): one hosts-only
 * threaded room per forum, in its own tables so nothing that reads topic
 * comments can see it. Callers (the API) enforce who may read and write —
 * canUseLounge + isLoungeEnabled — exactly as comments.ts leaves its gates
 * to the resolvers.
 *
 * A conversation is a root post (Markdown body) plus plain-text replies.
 * Conversations are ordered by BUMP: the root's lastActivityAt moves with
 * every new reply, never with an edit, a react or moderation.
 */

/** Roles that can ever be in the Lounge — mentions resolve only to them. */
const LOUNGE_ROLES: Role[] = ["host", "admin", "owner"];

export async function getLoungeComment(
  id: string,
): Promise<LoungeComment | null> {
  const [row] = await db
    .select()
    .from(loungeComments)
    .where(eq(loungeComments.id, id))
    .limit(1);
  return row ?? null;
}

/** @mentions resolve to members who can see the Lounge: a handle that
 * names an elector (or a deactivated member) records nothing, so a mention
 * can never notify someone the room is closed to. */
async function recordLoungeMentions(comment: LoungeComment): Promise<void> {
  const handles = parseMentionHandles(comment.body);
  if (handles.length === 0) return;
  const members = await db
    .select({ userId: timetableMemberships.userId })
    .from(timetableMemberships)
    .where(
      and(
        eq(timetableMemberships.timetableId, comment.timetableId),
        inArray(timetableMemberships.slug, handles),
        isNull(timetableMemberships.deactivatedAt),
        arrayOverlaps(timetableMemberships.roles, LOUNGE_ROLES),
        ne(timetableMemberships.userId, comment.authorId),
      ),
    );
  if (members.length === 0) return;
  await db
    .insert(loungeMentions)
    .values(members.map((m) => ({ commentId: comment.id, userId: m.userId })))
    .onConflictDoNothing();
}

async function logLounge(
  comment: LoungeComment,
  actorId: string,
  action: string,
  withSnippet = false,
): Promise<void> {
  await logActivity({
    timetableId: comment.timetableId,
    actorId,
    action,
    payload: {
      loungeCommentId: comment.id,
      ...(withSnippet ? { snippet: comment.body.slice(0, 140) } : {}),
    },
  });
}

/** Start a conversation. `body` is Markdown (the rich-text composer). */
export async function startLoungeConversation(
  timetableId: string,
  authorId: string,
  body: string,
): Promise<LoungeComment> {
  // lastActivityAt set here, in milliseconds, rather than by the column's
  // now() default (microseconds): the "Show older" cursor is a JS Date, and
  // a sub-millisecond bump time could fall between two cursor values and
  // be skipped. Every bump time is millisecond-precise this way.
  const [row] = await db
    .insert(loungeComments)
    .values({ timetableId, authorId, body, lastActivityAt: new Date() })
    .returning();
  if (!row) throw new Error("Failed to start conversation");
  await logLounge(row, authorId, "lounge.post", true);
  await recordLoungeMentions(row);
  return row;
}

/** Reply inside a conversation, and bump it to the top of the room. */
export async function replyInLounge(
  parent: LoungeComment,
  authorId: string,
  body: string,
): Promise<LoungeComment> {
  const rootId = parent.rootId ?? parent.id;
  const reply = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(loungeComments)
      .values({
        timetableId: parent.timetableId,
        parentId: parent.id,
        rootId,
        authorId,
        body,
      })
      .returning();
    if (!row) throw new Error("Failed to reply");
    // GREATEST: a concurrent reply that commits later with an earlier
    // timestamp must not move the bump backwards. ISO string + cast, never
    // a raw Date in a sql template (the Drizzle gotcha in CLAUDE.md).
    await tx
      .update(loungeComments)
      .set({
        lastActivityAt: sql`GREATEST(${loungeComments.lastActivityAt}, ${row.createdAt.toISOString()}::timestamptz)`,
      })
      .where(eq(loungeComments.id, rootId));
    return row;
  });
  await logLounge(reply, authorId, "lounge.reply", true);
  await recordLoungeMentions(reply);
  return reply;
}

/** Edits re-read mentions: a newly added @handle notifies (one already
 * recorded is ignored by the unique index). */
export async function editLoungeComment(
  id: string,
  body: string,
): Promise<LoungeComment | null> {
  const now = new Date();
  const [row] = await db
    .update(loungeComments)
    .set({ body, editedAt: now, updatedAt: now })
    .where(eq(loungeComments.id, id))
    .returning();
  if (row) await recordLoungeMentions(row);
  return row ?? null;
}

/** The conversation's opening post is hidden — everything in it is out of
 * sight for non-admins (the page, the dot, notifications). */
export async function isLoungeConversationHidden(
  post: LoungeComment,
): Promise<boolean> {
  if (post.hiddenAt) return true;
  if (!post.rootId) return false;
  const root = await getLoungeComment(post.rootId);
  return root?.hiddenAt != null;
}

export async function softDeleteLoungeComment(id: string): Promise<void> {
  const now = new Date();
  await db
    .update(loungeComments)
    .set({ deletedAt: now, updatedAt: now })
    .where(eq(loungeComments.id, id));
}

export async function setLoungeCommentHidden(
  id: string,
  hidden: boolean,
  byUserId: string,
): Promise<LoungeComment | null> {
  const [row] = await db
    .update(loungeComments)
    .set({
      hiddenAt: hidden ? new Date() : null,
      hiddenByUserId: hidden ? byUserId : null,
      updatedAt: new Date(),
    })
    .where(eq(loungeComments.id, id))
    .returning();
  if (row) {
    await logLounge(row, byUserId, hidden ? "lounge.hide" : "lounge.unhide");
  }
  return row ?? null;
}

/** Admins pin conversations (roots only — the caller checks). */
export async function setLoungeCommentPinned(
  id: string,
  pinned: boolean,
  byUserId: string,
): Promise<LoungeComment | null> {
  const [row] = await db
    .update(loungeComments)
    .set({ pinnedAt: pinned ? new Date() : null })
    .where(eq(loungeComments.id, id))
    .returning();
  if (row) {
    await logLounge(row, byUserId, pinned ? "lounge.pin" : "lounge.unpin");
  }
  return row ?? null;
}

/** Add or remove the viewer's react. `emoji` must already be normalised
 * (shared normalizeReaction). Never bumps the conversation. */
export async function setLoungeReaction(
  commentId: string,
  userId: string,
  emoji: string,
  on: boolean,
): Promise<void> {
  if (on) {
    await db
      .insert(loungeReactions)
      .values({ commentId, userId, emoji })
      .onConflictDoNothing();
  } else {
    await db
      .delete(loungeReactions)
      .where(
        and(
          eq(loungeReactions.commentId, commentId),
          eq(loungeReactions.userId, userId),
          eq(loungeReactions.emoji, emoji),
        ),
      );
  }
}

// ---------------------------------------------------------------------------
// Reading the room
// ---------------------------------------------------------------------------

export type LoungeReactionSummary = {
  emoji: string;
  count: number;
  /** Display names, in the order people reacted. */
  names: string[];
  viewerReacted: boolean;
};

export type LoungePost = {
  id: string;
  parentId: string | null;
  authorId: string;
  authorName: string | null;
  authorImage: string | null;
  authorRoles: string[];
  /** Markdown on a conversation's opening post, plain text on replies.
   * Blanked on a deleted tombstone. */
  body: string;
  hidden: boolean;
  deleted: boolean;
  editedAt: Date | null;
  pinnedAt: Date | null;
  createdAt: Date;
  reactions: LoungeReactionSummary[];
};

export type LoungeConversation = {
  root: LoungePost;
  /** Every reply in the conversation, oldest first, flat — the client
   * threads them by parentId (no nesting budget to spend in GraphQL). */
  replies: LoungePost[];
  lastActivityAt: Date;
};

export type LoungePage = {
  /** Pinned conversations (first page only), earliest pin first. */
  pinned: LoungeConversation[];
  /** Unpinned conversations, most recent activity first. */
  conversations: LoungeConversation[];
  /** Cursor for "Show older": the last conversation's bump time + id. */
  nextCursor: string | null;
};

export type LoungeReadOptions = {
  viewerId: string;
  /** Admins see hidden posts (dimmed), everyone else never receives them. */
  includeHidden: boolean;
  cursor?: string | null;
  limit?: number;
};

const PAGE_SIZE = 20;

function encodeCursor(at: Date, id: string): string {
  return `${at.toISOString()}_${id}`;
}

function decodeCursor(
  cursor: string | null | undefined,
): { at: Date; id: string } | null {
  if (!cursor) return null;
  const cut = cursor.lastIndexOf("_");
  if (cut < 0) return null;
  const at = new Date(cursor.slice(0, cut));
  const id = cursor.slice(cut + 1);
  if (Number.isNaN(at.getTime()) || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  return { at, id };
}

type PostRow = {
  id: string;
  parentId: string | null;
  rootId: string | null;
  authorId: string;
  authorName: string | null;
  authorImage: string | null;
  authorRoles: string[] | null;
  body: string;
  hiddenAt: Date | null;
  deletedAt: Date | null;
  editedAt: Date | null;
  pinnedAt: Date | null;
  lastActivityAt: Date;
  createdAt: Date;
};

function selectPosts(timetableId: string) {
  return db
    .select({
      id: loungeComments.id,
      parentId: loungeComments.parentId,
      rootId: loungeComments.rootId,
      authorId: loungeComments.authorId,
      authorName: timetableMemberships.name,
      authorImage: timetableMemberships.image,
      authorRoles: timetableMemberships.roles,
      body: loungeComments.body,
      hiddenAt: loungeComments.hiddenAt,
      deletedAt: loungeComments.deletedAt,
      editedAt: loungeComments.editedAt,
      pinnedAt: loungeComments.pinnedAt,
      lastActivityAt: loungeComments.lastActivityAt,
      createdAt: loungeComments.createdAt,
    })
    .from(loungeComments)
    .leftJoin(
      timetableMemberships,
      and(
        eq(timetableMemberships.userId, loungeComments.authorId),
        eq(timetableMemberships.timetableId, timetableId),
      ),
    );
}

async function loadReactions(
  commentIds: string[],
  viewerId: string,
  timetableId: string,
): Promise<Map<string, LoungeReactionSummary[]>> {
  const out = new Map<string, LoungeReactionSummary[]>();
  if (commentIds.length === 0) return out;
  const rows = await db
    .select({
      commentId: loungeReactions.commentId,
      userId: loungeReactions.userId,
      emoji: loungeReactions.emoji,
      name: timetableMemberships.name,
    })
    .from(loungeReactions)
    .leftJoin(
      timetableMemberships,
      and(
        eq(timetableMemberships.userId, loungeReactions.userId),
        eq(timetableMemberships.timetableId, timetableId),
      ),
    )
    .where(inArray(loungeReactions.commentId, commentIds))
    .orderBy(asc(loungeReactions.createdAt));
  for (const r of rows) {
    const list = out.get(r.commentId) ?? [];
    let entry = list.find((e) => e.emoji === r.emoji);
    if (!entry) {
      entry = { emoji: r.emoji, count: 0, names: [], viewerReacted: false };
      list.push(entry);
    }
    entry.count += 1;
    entry.names.push(r.name ?? "Former member");
    if (r.userId === viewerId) entry.viewerReacted = true;
    out.set(r.commentId, list);
  }
  return out;
}

function toPost(
  r: PostRow,
  reactions: Map<string, LoungeReactionSummary[]>,
): LoungePost {
  const deleted = r.deletedAt !== null;
  return {
    id: r.id,
    parentId: r.parentId,
    // Deleted text never reaches a client (as comments.ts pruneDeleted).
    authorId: deleted ? "" : r.authorId,
    authorName: deleted ? null : r.authorName,
    authorImage: deleted ? null : r.authorImage,
    authorRoles: deleted ? [] : (r.authorRoles ?? []),
    body: deleted ? "" : r.body,
    hidden: r.hiddenAt !== null,
    deleted,
    editedAt: r.editedAt,
    pinnedAt: r.pinnedAt,
    createdAt: r.createdAt,
    reactions: deleted ? [] : (reactions.get(r.id) ?? []),
  };
}

/** Deleted posts survive only as tombstones over live replies — the same
 * bottom-up rule as topic threads, applied to a flat reply list. */
function pruneDeletedReplies(replies: PostRow[]): PostRow[] {
  const childCount = new Map<string, number>();
  const live = new Set<string>();
  // Oldest-first input: walk newest-first so children resolve before parents.
  for (const r of [...replies].reverse()) {
    const keep = r.deletedAt === null || (childCount.get(r.id) ?? 0) > 0;
    if (keep) {
      live.add(r.id);
      if (r.parentId) {
        childCount.set(r.parentId, (childCount.get(r.parentId) ?? 0) + 1);
      }
    }
  }
  return replies.filter((r) => live.has(r.id));
}

async function assemble(
  timetableId: string,
  roots: PostRow[],
  opts: LoungeReadOptions,
): Promise<LoungeConversation[]> {
  if (roots.length === 0) return [];
  const replyConds = [
    inArray(
      loungeComments.rootId,
      roots.map((r) => r.id),
    ),
  ];
  if (!opts.includeHidden) replyConds.push(isNull(loungeComments.hiddenAt));
  const replyRows: PostRow[] = await selectPosts(timetableId)
    .where(and(...replyConds))
    .orderBy(asc(loungeComments.createdAt));

  const byRoot = new Map<string, PostRow[]>();
  for (const r of replyRows) {
    if (!r.rootId) continue;
    const list = byRoot.get(r.rootId) ?? [];
    list.push(r);
    byRoot.set(r.rootId, list);
  }

  const out: { root: PostRow; replies: PostRow[] }[] = [];
  for (const root of roots) {
    const replies = pruneDeletedReplies(byRoot.get(root.id) ?? []);
    // A deleted opening post stays as a tombstone only over live replies.
    if (root.deletedAt && replies.length === 0) continue;
    out.push({ root, replies });
  }

  const reactions = await loadReactions(
    out.flatMap((c) => [c.root.id, ...c.replies.map((r) => r.id)]),
    opts.viewerId,
    timetableId,
  );
  return out.map((c) => ({
    root: toPost(c.root, reactions),
    replies: c.replies.map((r) => toPost(r, reactions)),
    lastActivityAt: c.root.lastActivityAt,
  }));
}

/** One page of the room. Pins ride the first page only (they sit above
 * everything); the rest pages by bump order with a keyset cursor, so a
 * conversation bumped while you page can't be shown twice or skipped past
 * silently — it simply moves above where you've read. */
export async function listLoungePage(
  timetableId: string,
  opts: LoungeReadOptions,
): Promise<LoungePage> {
  const limit = Math.min(Math.max(opts.limit ?? PAGE_SIZE, 1), 50);
  const cursor = decodeCursor(opts.cursor);
  const base = [
    eq(loungeComments.timetableId, timetableId),
    isNull(loungeComments.parentId),
  ];
  if (!opts.includeHidden) base.push(isNull(loungeComments.hiddenAt));

  const pinnedRoots: PostRow[] = cursor
    ? []
    : await selectPosts(timetableId)
        .where(and(...base, isNotNull(loungeComments.pinnedAt)))
        .orderBy(asc(loungeComments.pinnedAt));

  const pageConds = [...base, isNull(loungeComments.pinnedAt)];
  if (cursor) {
    const olderThan = or(
      lt(loungeComments.lastActivityAt, cursor.at),
      and(
        eq(loungeComments.lastActivityAt, cursor.at),
        lt(loungeComments.id, cursor.id),
      ),
    );
    if (olderThan) pageConds.push(olderThan);
  }
  const rows: PostRow[] = await selectPosts(timetableId)
    .where(and(...pageConds))
    .orderBy(desc(loungeComments.lastActivityAt), desc(loungeComments.id))
    .limit(limit + 1);
  const hasMore = rows.length > limit;
  const pageRoots = rows.slice(0, limit);
  const last = pageRoots[pageRoots.length - 1];

  const [pinned, conversations] = await Promise.all([
    assemble(timetableId, pinnedRoots, opts),
    assemble(timetableId, pageRoots, opts),
  ]);
  return {
    pinned,
    conversations,
    nextCursor:
      hasMore && last ? encodeCursor(last.lastActivityAt, last.id) : null,
  };
}

/** One conversation (for a permalink / digest deep link), or null. */
export async function getLoungeConversation(
  timetableId: string,
  rootId: string,
  opts: LoungeReadOptions,
): Promise<LoungeConversation | null> {
  const conds = [
    eq(loungeComments.timetableId, timetableId),
    eq(loungeComments.id, rootId),
    isNull(loungeComments.parentId),
  ];
  if (!opts.includeHidden) conds.push(isNull(loungeComments.hiddenAt));
  const roots: PostRow[] = await selectPosts(timetableId).where(and(...conds));
  const [conversation] = await assemble(timetableId, roots, opts);
  return conversation ?? null;
}

// ---------------------------------------------------------------------------
// Read watermark (nav dot + digest suppression)
// ---------------------------------------------------------------------------

export async function markLoungeSeen(
  timetableId: string,
  userId: string,
  at: Date = new Date(),
): Promise<void> {
  // GREATEST: a digest click stamped at send time must never move the mark
  // backwards past a later visit.
  await db
    .update(timetableMemberships)
    .set({
      loungeSeenAt: sql`GREATEST(COALESCE(${timetableMemberships.loungeSeenAt}, '-infinity'::timestamptz), ${at.toISOString()}::timestamptz)`,
    })
    .where(
      and(
        eq(timetableMemberships.timetableId, timetableId),
        eq(timetableMemberships.userId, userId),
      ),
    );
}

/** Is there a Lounge post by someone else the viewer hasn't seen? Hidden
 * and deleted posts never count. */
export async function hasUnreadLounge(
  timetableId: string,
  userId: string,
): Promise<boolean> {
  const [membership] = await db
    .select({ seenAt: timetableMemberships.loungeSeenAt })
    .from(timetableMemberships)
    .where(
      and(
        eq(timetableMemberships.timetableId, timetableId),
        eq(timetableMemberships.userId, userId),
      ),
    )
    .limit(1);
  if (!membership) return false;
  const roots = alias(loungeComments, "lounge_roots");
  const conds = [
    eq(loungeComments.timetableId, timetableId),
    ne(loungeComments.authorId, userId),
    isNull(loungeComments.hiddenAt),
    isNull(loungeComments.deletedAt),
    // Nothing inside a hidden conversation lights the dot.
    isNull(roots.hiddenAt),
  ];
  if (membership.seenAt) {
    conds.push(gt(loungeComments.createdAt, membership.seenAt));
  }
  const [row] = await db
    .select({ id: loungeComments.id })
    .from(loungeComments)
    .leftJoin(roots, eq(roots.id, loungeComments.rootId))
    .where(and(...conds))
    .limit(1);
  return row !== undefined;
}
