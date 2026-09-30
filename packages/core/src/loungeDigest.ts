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
  /** The newest post the card shows as new — a digest click marks the
   * Lounge read up to here, not to the send time (the card leaves
   * colleague-to-colleague replies out, and caps its conversations). */
  shownUntil: Date;
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

type Fresh = { id: string; parentId: string | null; rootId: string | null };

/** Posts by others since `since` — the candidates for news. */
function loadFresh(input: LoungeDigestInput): Promise<Fresh[]> {
  return db
    .select({
      id: loungeComments.id,
      parentId: loungeComments.parentId,
      rootId: loungeComments.rootId,
    })
    .from(loungeComments)
    .where(
      and(
        eq(loungeComments.timetableId, input.timetableId),
        gt(loungeComments.createdAt, input.since),
        ne(loungeComments.authorId, input.recipientId),
        isNull(loungeComments.hiddenAt),
        isNull(loungeComments.deletedAt),
      ),
    );
}

/** The recipient's footprint: every post they wrote (and its parent, as
 * chains attach at the root — loadChainScope's rule for topic threads),
 * the conversations they started, and fresh posts that @mention them. */
async function loadFootprint(input: LoungeDigestInput, fresh: Fresh[]) {
  const [mine, mentions] = await Promise.all([
    db
      .select({ id: loungeComments.id, parentId: loungeComments.parentId })
      .from(loungeComments)
      .where(
        and(
          eq(loungeComments.timetableId, input.timetableId),
          eq(loungeComments.authorId, input.recipientId),
        ),
      ),
    db
      .select({ commentId: loungeMentions.commentId })
      .from(loungeMentions)
      .where(
        and(
          eq(loungeMentions.userId, input.recipientId),
          inArray(
            loungeMentions.commentId,
            fresh.map((f) => f.id),
          ),
        ),
      ),
  ]);
  const chains = new Set<string>();
  const started = new Set<string>();
  for (const m of mine) {
    chains.add(m.id);
    if (m.parentId) chains.add(m.parentId);
    else started.add(m.id);
  }
  return {
    chains,
    started,
    mentioned: new Set(mentions.map((r) => r.commentId)),
  };
}

type Footprint = Awaited<ReturnType<typeof loadFootprint>>;

/** New conversations, replies in ones they started or chains they're in,
 * and @mentions — the rest of the room stays in the room. */
function isNewsFor(f: Fresh, fp: Footprint): boolean {
  if (f.parentId === null) return true;
  if (fp.mentioned.has(f.id) || fp.chains.has(f.parentId)) return true;
  return f.rootId !== null && fp.started.has(f.rootId);
}

/** Posts with their author's name in this forum. */
function selectRows(timetableId: string) {
  return db
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
    );
}

function toComment(r: Row): DigestComment {
  return {
    id: r.id,
    parentId: r.parentId,
    author: { name: r.authorName, userId: r.authorId, image: null },
    body: r.deletedAt ? "[comment removed]" : r.body,
  };
}

/** One conversation's shown posts: the opening post, each new post, and
 * the ancestors that give it context — opening post first, then oldest
 * first. Null when nothing in it is new. */
function buildConversation(
  root: Row,
  byId: Map<string, Row>,
  newIds: Set<string>,
): DigestLoungeConversation | null {
  const shown = new Set<string>([root.id]);
  for (const id of newIds) {
    const post = byId.get(id);
    if (!post || (post.rootId ?? post.id) !== root.id) continue;
    for (let at: Row | undefined = post; at; ) {
      shown.add(at.id);
      at = at.parentId ? byId.get(at.parentId) : undefined;
    }
  }
  const rows = [...shown]
    .map((id) => byId.get(id))
    .filter((r): r is Row => r !== undefined && r.hiddenAt === null);
  const replies = rows
    .filter((r) => r.parentId !== null)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const posts = [root, ...replies].map((r) => ({
    comment: toComment(r),
    isNew: newIds.has(r.id),
  }));
  return posts.some((p) => p.isNew) ? { rootId: root.id, posts } : null;
}

/** The later of `current` and the newest post this conversation shows as
 * new. */
function newestNew(
  conv: DigestLoungeConversation,
  byId: Map<string, Row>,
  current: Date,
): Date {
  let newest = current;
  for (const p of conv.posts) {
    const at = p.isNew ? byId.get(p.comment.id)?.createdAt : undefined;
    if (at && at > newest) newest = at;
  }
  return newest;
}

export async function loadLoungeDigestCard(
  input: LoungeDigestInput,
): Promise<DigestLoungeCard | null> {
  const fresh = await loadFresh(input);
  if (fresh.length === 0) return null;
  const footprint = await loadFootprint(input, fresh);
  const qualifying = fresh.filter((f) => isNewsFor(f, footprint));
  if (qualifying.length === 0) return null;

  const rootIds = [...new Set(qualifying.map((q) => q.rootId ?? q.id))];
  const [roots, replies] = await Promise.all([
    selectRows(input.timetableId)
      .where(
        and(
          eq(loungeComments.timetableId, input.timetableId),
          inArray(loungeComments.id, rootIds),
        ),
      )
      .orderBy(desc(loungeComments.lastActivityAt)),
    selectRows(input.timetableId).where(
      inArray(loungeComments.rootId, rootIds),
    ),
  ]);
  const byId = new Map<string, Row>();
  for (const r of [...roots, ...replies]) byId.set(r.id, r);
  const newIds = new Set(qualifying.map((q) => q.id));

  const conversations: DigestLoungeConversation[] = [];
  let shownUntil = new Date(0);
  // Roots arrive in bump order. A hidden or deleted opening post takes its
  // conversation out of the email (hidden posts are admin-only in the app).
  for (const root of roots) {
    if (root.hiddenAt || root.deletedAt) continue;
    const conv = buildConversation(root, byId, newIds);
    if (!conv) continue;
    conversations.push(conv);
    shownUntil = newestNew(conv, byId, shownUntil);
    if (conversations.length >= MAX_CONVERSATIONS) break;
  }
  if (conversations.length === 0) return null;
  return { path: `/f/${input.forumSlug}/lounge`, conversations, shownUntil };
}
