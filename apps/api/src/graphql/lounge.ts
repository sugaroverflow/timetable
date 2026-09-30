import { GraphQLError } from "graphql";

import {
  editLoungeComment,
  getLoungeComment,
  getLoungeConversation,
  getTimetableById,
  hasUnreadLounge,
  listLoungePage,
  markLoungeSeen,
  replyInLounge,
  setLoungeCommentHidden,
  setLoungeCommentPinned,
  setLoungeReaction,
  softDeleteLoungeComment,
  startLoungeConversation,
  type LoungeConversation,
  type LoungePage,
  type LoungePost,
  type LoungeReactionSummary,
} from "@timetable/core";
import type { LoungeComment, Timetable } from "@timetable/db";
import {
  canModerate,
  canUseLounge,
  isLoungeEnabled,
  normalizeReaction,
  type Viewer,
} from "@timetable/shared";

import { assertActionLimit } from "../http/action-limits";
import { renderMarkdown } from "../markdown";
import { builder } from "./builder";
import {
  capLength,
  forbidden,
  notFound,
  readTimetable,
  requireUser,
} from "./guards";
import type { ApiContext } from "../context";

/**
 * The {host} Lounge (docs/host-lounge-plan.md, 2026-09-30): one hosts-only
 * threaded room per forum. Every field and mutation here passes ONE gate —
 * the forum has the Lounge switched on AND the viewer is a host, admin or
 * owner (canUseLounge; deactivated members resolve to no roles). Anyone
 * else gets null / NOT_FOUND, never a hint that a Lounge exists.
 */

/** Opening posts are topic-length writing; replies are chat-length. */
const MAX_OPENING = 100_000;
const MAX_REPLY = 20_000;

function mayEnter(timetable: Timetable, viewer: Viewer): boolean {
  if (!isLoungeEnabled(timetable.settings ?? {})) return false;
  if (timetable.privacy === "deactivated" && !canModerate(viewer)) {
    return false;
  }
  return canUseLounge(viewer);
}

/** The gate for mutations on an existing post: the post's forum must let
 * this viewer in. Refusals read as "not found" so the room stays unseen. */
async function loadPostForViewer(
  ctx: ApiContext,
  commentId: string,
): Promise<{ post: LoungeComment; viewer: Viewer; userId: string }> {
  const user = await requireUser(ctx);
  const post = await getLoungeComment(commentId);
  if (!post) notFound("Post not found");
  const timetable = await getTimetableById(post.timetableId);
  const viewer = await ctx.getViewer(post.timetableId);
  if (!timetable || !mayEnter(timetable, viewer)) notFound("Post not found");
  return { post, viewer, userId: user.id };
}

function requireBody(raw: string, max: number): string {
  const body = raw.trim();
  if (!body) throw new GraphQLError("Write something first");
  capLength(body, max, "Post");
  return body;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

const LoungeReactionType = builder
  .objectRef<LoungeReactionSummary>("LoungeReaction")
  .implement({
    fields: (t) => ({
      emoji: t.exposeString("emoji"),
      count: t.exposeInt("count"),
      names: t.exposeStringList("names"),
      viewerReacted: t.exposeBoolean("viewerReacted"),
    }),
  });

const LoungePostType = builder.objectRef<LoungePost>("LoungePost").implement({
  fields: (t) => ({
    id: t.exposeID("id"),
    parentId: t.exposeID("parentId", { nullable: true }),
    authorId: t.exposeString("authorId"),
    authorName: t.exposeString("authorName", { nullable: true }),
    authorImage: t.exposeString("authorImage", { nullable: true }),
    authorRoles: t.exposeStringList("authorRoles"),
    /** Markdown source on an opening post (for editing), plain text on a
     * reply. */
    body: t.exposeString("body"),
    /** Opening posts only: the body rendered and sanitised, like a topic's
     * bodyHtml. Null on replies, which display as plain text. */
    bodyHtml: t.string({
      nullable: true,
      resolve: (p) =>
        p.parentId === null && !p.deleted ? renderMarkdown(p.body) : null,
    }),
    hidden: t.exposeBoolean("hidden"),
    deleted: t.exposeBoolean("deleted"),
    editedAt: t.string({
      nullable: true,
      resolve: (p) => p.editedAt?.toISOString() ?? null,
    }),
    pinnedAt: t.string({
      nullable: true,
      resolve: (p) => p.pinnedAt?.toISOString() ?? null,
    }),
    createdAt: t.string({ resolve: (p) => p.createdAt.toISOString() }),
    reactions: t.field({
      type: [LoungeReactionType],
      resolve: (p) => p.reactions,
    }),
  }),
});

const LoungeConversationType = builder
  .objectRef<LoungeConversation>("LoungeConversation")
  .implement({
    fields: (t) => ({
      id: t.id({ resolve: (c) => c.root.id }),
      root: t.field({ type: LoungePostType, resolve: (c) => c.root }),
      /** Every reply, oldest first, flat — thread them by parentId. */
      replies: t.field({ type: [LoungePostType], resolve: (c) => c.replies }),
      lastActivityAt: t.string({
        resolve: (c) => c.lastActivityAt.toISOString(),
      }),
    }),
  });

type LoungeView = LoungePage & { focused: LoungeConversation | null };

const LoungePageType = builder.objectRef<LoungeView>("LoungePage").implement({
  fields: (t) => ({
    pinned: t.field({
      type: [LoungeConversationType],
      resolve: (p) => p.pinned,
    }),
    conversations: t.field({
      type: [LoungeConversationType],
      resolve: (p) => p.conversations,
    }),
    /** Pass back as `cursor` for "Show older"; null at the end. */
    nextCursor: t.exposeString("nextCursor", { nullable: true }),
    /** The conversation named by `conversationId` when it isn't already on
     * this page (an older one, reached from a digest or notification). */
    focused: t.field({
      type: LoungeConversationType,
      nullable: true,
      resolve: (p) => p.focused,
    }),
  }),
});

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

builder.queryFields((t) => ({
  /** One page of the forum's {host} Lounge, or null when the viewer can't
   * enter it (Lounge off, or not a host/admin). */
  lounge: t.field({
    type: LoungePageType,
    nullable: true,
    args: {
      idOrSlug: t.arg.string({ required: true }),
      cursor: t.arg.string({ required: false }),
      conversationId: t.arg.string({ required: false }),
    },
    resolve: async (_p, args, ctx) => {
      if (!ctx.user) return null;
      const readable = await readTimetable(ctx, args.idOrSlug);
      if (!readable) return null;
      const viewer: Viewer = { userId: ctx.user.id, roles: readable.roles };
      if (!mayEnter(readable.timetable, viewer)) return null;
      const opts = {
        viewerId: ctx.user.id,
        includeHidden: canModerate(viewer),
        cursor: args.cursor ?? null,
      };
      const page = await listLoungePage(readable.timetable.id, opts);
      let focused: LoungeConversation | null = null;
      const wanted = args.conversationId;
      if (
        wanted &&
        /^[0-9a-f-]{36}$/i.test(wanted) &&
        ![...page.pinned, ...page.conversations].some(
          (c) => c.root.id === wanted,
        )
      ) {
        focused = await getLoungeConversation(
          readable.timetable.id,
          wanted,
          opts,
        );
      }
      return { ...page, focused };
    },
  }),

  /** The nav's unread dot: a Lounge post by someone else since the
   * viewer's last visit. False wherever the viewer can't enter. */
  loungeUnread: t.boolean({
    args: { idOrSlug: t.arg.string({ required: true }) },
    resolve: async (_p, args, ctx) => {
      if (!ctx.user) return false;
      const readable = await readTimetable(ctx, args.idOrSlug);
      if (!readable) return false;
      const viewer: Viewer = { userId: ctx.user.id, roles: readable.roles };
      if (!mayEnter(readable.timetable, viewer)) return false;
      return hasUnreadLounge(readable.timetable.id, ctx.user.id);
    },
  }),
}));

// ---------------------------------------------------------------------------
// Mutations — every one returns the affected post's id; the web client
// refreshes the page rather than patching a cache.
// ---------------------------------------------------------------------------

builder.mutationFields((t) => ({
  startLoungeConversation: t.id({
    args: {
      idOrSlug: t.arg.string({ required: true }),
      body: t.arg.string({ required: true }),
    },
    resolve: async (_p, args, ctx) => {
      const user = await requireUser(ctx);
      const readable = await readTimetable(ctx, args.idOrSlug);
      if (!readable) notFound("Forum not found");
      const viewer: Viewer = { userId: user.id, roles: readable.roles };
      if (!mayEnter(readable.timetable, viewer)) notFound("Forum not found");
      const body = requireBody(args.body, MAX_OPENING);
      await assertActionLimit(user.id, "comment");
      const post = await startLoungeConversation(
        readable.timetable.id,
        user.id,
        body,
      );
      return post.id;
    },
  }),

  replyInLounge: t.id({
    args: {
      commentId: t.arg.string({ required: true }),
      body: t.arg.string({ required: true }),
    },
    resolve: async (_p, args, ctx) => {
      const { post, userId } = await loadPostForViewer(ctx, args.commentId);
      if (post.deletedAt) notFound("Post not found");
      const body = requireBody(args.body, MAX_REPLY);
      await assertActionLimit(userId, "comment");
      const reply = await replyInLounge(post, userId, body);
      return reply.id;
    },
  }),

  /** Author-only edit — Markdown on an opening post, plain text on a
   * reply. Edits never bump the conversation. */
  editLoungePost: t.id({
    args: {
      commentId: t.arg.string({ required: true }),
      body: t.arg.string({ required: true }),
    },
    resolve: async (_p, args, ctx) => {
      const { post, userId } = await loadPostForViewer(ctx, args.commentId);
      if (post.deletedAt) notFound("Post not found");
      if (post.authorId !== userId)
        forbidden("You can only edit your own posts");
      const body = requireBody(
        args.body,
        post.parentId ? MAX_REPLY : MAX_OPENING,
      );
      await editLoungeComment(post.id, body);
      return post.id;
    },
  }),

  /** Author-only soft delete: a tombstone over live replies, gone
   * otherwise. Admin moderation is hideLoungePost. */
  deleteLoungePost: t.id({
    args: { commentId: t.arg.string({ required: true }) },
    resolve: async (_p, args, ctx) => {
      const { post, userId } = await loadPostForViewer(ctx, args.commentId);
      if (post.deletedAt) notFound("Post not found");
      if (post.authorId !== userId) {
        forbidden("You can only delete your own posts");
      }
      await softDeleteLoungeComment(post.id);
      return post.id;
    },
  }),

  hideLoungePost: t.id({
    args: {
      commentId: t.arg.string({ required: true }),
      hidden: t.arg.boolean({ required: true }),
    },
    resolve: async (_p, args, ctx) => {
      const { post, viewer, userId } = await loadPostForViewer(
        ctx,
        args.commentId,
      );
      if (!canModerate(viewer)) forbidden("Admins only");
      await setLoungeCommentHidden(post.id, args.hidden, userId);
      return post.id;
    },
  }),

  /** Admins pin conversations (Ed, 2026-09-30: a room has no author to
   * own it). Opening posts only. */
  pinLoungeConversation: t.id({
    args: {
      commentId: t.arg.string({ required: true }),
      pinned: t.arg.boolean({ required: true }),
    },
    resolve: async (_p, args, ctx) => {
      const { post, viewer, userId } = await loadPostForViewer(
        ctx,
        args.commentId,
      );
      if (!canModerate(viewer)) forbidden("Admins only");
      if (post.parentId) forbidden("Only a conversation can be pinned");
      if (post.deletedAt) notFound("Post not found");
      await setLoungeCommentPinned(post.id, args.pinned, userId);
      return post.id;
    },
  }),

  /** Add or remove the viewer's emoji react. ❤️ and 💙 are refused —
   * they are weighted votes in Topic, not reactions. Never bumps. */
  setLoungeReaction: t.id({
    args: {
      commentId: t.arg.string({ required: true }),
      emoji: t.arg.string({ required: true }),
      on: t.arg.boolean({ required: true }),
    },
    resolve: async (_p, args, ctx) => {
      const { post, userId } = await loadPostForViewer(ctx, args.commentId);
      if (post.deletedAt) notFound("Post not found");
      const emoji = normalizeReaction(args.emoji);
      if (!emoji) throw new GraphQLError("That isn't a reaction we accept");
      await setLoungeReaction(post.id, userId, emoji, args.on);
      return post.id;
    },
  }),

  /** Visiting the Lounge reads it: clears the nav dot. */
  markLoungeSeen: t.boolean({
    args: { idOrSlug: t.arg.string({ required: true }) },
    resolve: async (_p, args, ctx) => {
      const user = await requireUser(ctx);
      const readable = await readTimetable(ctx, args.idOrSlug);
      if (!readable) return false;
      const viewer: Viewer = { userId: user.id, roles: readable.roles };
      if (!mayEnter(readable.timetable, viewer)) return false;
      await markLoungeSeen(readable.timetable.id, user.id);
      return true;
    },
  }),
}));
