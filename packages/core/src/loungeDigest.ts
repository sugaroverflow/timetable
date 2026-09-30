import { and, desc, eq, gt, inArray, isNull, ne } from "drizzle-orm";

import {
  db,
  loungeComments,
  loungeMentions,
  timetableMemberships,
} from "@timetable/db";

import type { DigestComment } from "./digests";

/**
 * The {host} Lounge's digest card (docs/host-lounge-plan.md decision 10):
 * ONE card, always last, never counted in the subject line. It carries —
 * for conversations with news — new conversations (someone else's opening
 * post), replies in conversations the recipient started or chains they
 * are part of, and posts that @mention them. Everything else in the room
 * stays in the room: a reply between two colleagues doesn't reach the
 * whole faculty's inbox, which is what keeps the Lounge slower than a
 * group chat.
 *
 * Suppressed against the recipient's Lounge read mark (loungeSeenAt), the
 * same way topic comments suppress against comment_seen.
 */

/** One post in a digest conversation. The opening post's body is
 * Markdown; the renderer excerpts it. */
export type DigestLoungePost = { comment: DigestComment; isNew: boolean };

export type DigestLoungeConversation = {
  rootId: string;
  /** The opening post first, then every shown post (new ones and the
   * ancestors that give them context), oldest first. */
  posts: DigestLoungePost[];
};

export type DigestLoungeCard = {
  /** The Lounge page, e.g. `/f/<slug>/lounge`. */
  path: string;
  conversations: DigestLoungeConversation[];
};

/** At most this many conversations; the card always ends with a link to
 * the room for the rest. */
const MAX_CONVERSATIONS = 8;

type Row = {
  id: string;
  parentId: string | null;
  rootId: string | null;
  authorId: string;
  authorName: string | null;
  body: string;
  hiddenAt: Date | null;
  deletedAt: Date | null;
  createdAt: Date;
  lastActivityAt: Date;
};

export type LoungeDigestInput = {
  recipientId: string;
  timetableId: string;
  forumSlug: string;
  /** News is anything created after this (window start, raised to the
   * recipient's Lounge read mark). */
  since: Date;
};

export async function loadLoungeDigestCard(
  input: LoungeDigestInput,
): Promise<DigestLoungeCard | null> {
  const { recipientId: me, timetableId, since } = input;

  const fresh = await db
    .select({
      id: loungeComments.id,
      parentId: loungeComments.parentId,
      rootId: loungeComments.rootId,
    })
    .from(loungeComments)
    .where(
      and(
        eq(loungeComments.timetableId, timetableId),
        gt(loungeComments.createdAt, since),
        ne(loungeComments.authorId, me),
        isNull(loungeComments.hiddenAt),
        isNull(loungeComments.deletedAt),
      ),
    );
  if (fresh.length === 0) return null;

  // The recipient's footprint: every post they wrote (and its parent, as
  // chains attach at the root — loadChainScope's rule for topic threads),
  // plus the conversations they started.
  const mine = await db
    .select({
      id: loungeComments.id,
      parentId: loungeComments.parentId,
    })
    .from(loungeComments)
    .where(
      and(
        eq(loungeComments.timetableId, timetableId),
        eq(loungeComments.authorId, me),
      ),
    );
  const chains = new Set<string>();
  const startedByMe = new Set<string>();
  for (const m of mine) {
    chains.add(m.id);
    if (m.parentId) chains.add(m.parentId);
    else startedByMe.add(m.id);
  }
  const mentioned = new Set(
    (
      await db
        .select({ commentId: loungeMentions.commentId })
        .from(loungeMentions)
        .where(
          and(
            eq(loungeMentions.userId, me),
            inArray(
              loungeMentions.commentId,
              fresh.map((f) => f.id),
            ),
          ),
        )
    ).map((r) => r.commentId),
  );

  const qualifying = fresh.filter(
    (f) =>
      f.parentId === null ||
      mentioned.has(f.id) ||
      (f.rootId !== null && startedByMe.has(f.rootId)) ||
      chains.has(f.parentId),
  );
  if (qualifying.length === 0) return null;

  const rootIds = [...new Set(qualifying.map((q) => q.rootId ?? q.id))];
  const rows: Row[] = await db
    .select({
      id: loungeComments.id,
      parentId: loungeComments.parentId,
      rootId: loungeComments.rootId,
      authorId: loungeComments.authorId,
      authorName: timetableMemberships.name,
      body: loungeComments.body,
      hiddenAt: loungeComments.hiddenAt,
      deletedAt: loungeComments.deletedAt,
      createdAt: loungeComments.createdAt,
      lastActivityAt: loungeComments.lastActivityAt,
    })
    .from(loungeComments)
    .leftJoin(
      timetableMemberships,
      and(
        eq(timetableMemberships.userId, loungeComments.authorId),
        eq(timetableMemberships.timetableId, timetableId),
      ),
    )
    .where(
      and(
        eq(loungeComments.timetableId, timetableId),
        // Roots and their replies, in one pass.
        inArray(loungeComments.id, rootIds),
      ),
    )
    .orderBy(desc(loungeComments.lastActivityAt));
  const replyRows: Row[] = await db
    .select({
      id: loungeComments.id,
      parentId: loungeComments.parentId,
      rootId: loungeComments.rootId,
      authorId: loungeComments.authorId,
      authorName: timetableMemberships.name,
      body: loungeComments.body,
      hiddenAt: loungeComments.hiddenAt,
      deletedAt: loungeComments.deletedAt,
      createdAt: loungeComments.createdAt,
      lastActivityAt: loungeComments.lastActivityAt,
    })
    .from(loungeComments)
    .leftJoin(
      timetableMemberships,
      and(
        eq(timetableMemberships.userId, loungeComments.authorId),
        eq(timetableMemberships.timetableId, timetableId),
      ),
    )
    .where(inArray(loungeComments.rootId, rootIds));

  const byId = new Map<string, Row>();
  for (const r of [...rows, ...replyRows]) byId.set(r.id, r);
  const newIds = new Set(qualifying.map((q) => q.id));

  const toComment = (r: Row): DigestComment => ({
    id: r.id,
    parentId: r.parentId,
    author: { name: r.authorName, userId: r.authorId, image: null },
    body: r.deletedAt ? "[comment removed]" : r.body,
  });

  const conversations: DigestLoungeConversation[] = [];
  // `rows` holds the roots, already in bump order.
  for (const root of rows) {
    // A hidden or deleted opening post takes its conversation out of the
    // email (hidden posts are admin-only in the app, too).
    if (root.hiddenAt || root.deletedAt) continue;
    const shown = new Set<string>([root.id]);
    for (const id of newIds) {
      const post = byId.get(id);
      if (!post || (post.rootId ?? post.id) !== root.id) continue;
      // The post and its ancestors, up to the opening post.
      let cursor: Row | undefined = post;
      while (cursor) {
        shown.add(cursor.id);
        cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
      }
    }
    const posts = [...shown]
      .map((id) => byId.get(id))
      .filter((r): r is Row => r !== undefined && r.hiddenAt === null)
      .sort((a, b) =>
        a.parentId === null
          ? -1
          : b.parentId === null
            ? 1
            : a.createdAt.getTime() - b.createdAt.getTime(),
      )
      .map((r) => ({ comment: toComment(r), isNew: newIds.has(r.id) }));
    if (posts.some((p) => p.isNew))
      conversations.push({ rootId: root.id, posts });
    if (conversations.length >= MAX_CONVERSATIONS) break;
  }
  if (conversations.length === 0) return null;
  return { path: `/f/${input.forumSlug}/lounge`, conversations };
}
