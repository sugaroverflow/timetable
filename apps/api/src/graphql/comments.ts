import { GraphQLError } from "graphql";

import {
  addComment,
  addReply,
  getCommentById,
  getTimetableById,
  getTopicById,
  getUserById,
  getViewerRoles,
  setCommentHidden,
  softDeleteComment,
  updateCommentBody,
  type CommentNode,
} from "@timetable/core";
import type { Comment } from "@timetable/db";
import {
  canComment,
  canModerate,
  canSeeHostOnly,
  isHostCommentsEnabled,
  type Viewer,
} from "@timetable/shared";

import { assertActionLimit } from "../http/action-limits";
import { builder } from "./builder";
import { forbidden, loadTopicAndViewer, notFound, requireUser } from "./guards";
import { CommentType } from "./types";

type CommentVisibility = Comment["visibility"];

/** The per-visibility permission ladder shared by addComment and
 * replyToComment (2026-08-03 — was duplicated inline in both resolvers
 * behind complexity disables):
 * - admin_only (the drafting thread): admins + the topic's owner
 * - host_only: hosts/admins
 * - public: any commenting member, and only on published topics */
function assertMayComment(
  viewer: Viewer,
  topic: { hostId: string; status: string },
  userId: string,
  visibility: CommentVisibility,
): void {
  if (visibility === "admin_only") {
    if (!canModerate(viewer) && topic.hostId !== userId) {
      forbidden("Admins and the topic owner only");
    }
  } else if (visibility === "host_only") {
    if (!canSeeHostOnly(viewer)) forbidden("Hosts/admins only");
  } else {
    if (!canComment(viewer)) forbidden("Members only");
    if (topic.status !== "published") {
      forbidden("This topic isn't open for comments yet");
    }
  }
}

function requireBody(raw: string): string {
  const body = raw.trim();
  if (!body) throw new GraphQLError("Comment cannot be empty");
  return body;
}

/** New host_only comments are refused while the forum's host-only thread
 * is switched off (host hearts, 2026-08-04) — the UI hides the composer;
 * this is the API-side backstop. Existing comments are kept, just hidden. */
async function assertHostThreadOpen(
  timetableId: string,
  visibility: CommentVisibility,
): Promise<void> {
  if (visibility !== "host_only") return;
  const timetable = await getTimetableById(timetableId);
  if (timetable && !isHostCommentsEnabled(timetable.settings)) {
    forbidden("The host-only thread is switched off in this forum");
  }
}

/** One mutation-payload builder for every comment mutation (they used to
 * hand-assemble this object four times). Resolves the author's display
 * fields + forum roles; the web client only selects `id` and refreshes,
 * so these lookups are the payload's whole cost. */
async function commentNode(
  row: Comment,
  timetableId: string | null,
): Promise<CommentNode> {
  const author = await getUserById(row.authorId);
  const authorRoles = timetableId
    ? await getViewerRoles(row.authorId, timetableId)
    : [];
  return {
    id: row.id,
    parentId: row.parentId,
    authorId: row.authorId,
    authorName: author?.name ?? null,
    authorImage: author?.image ?? null,
    authorRoles,
    body: row.body,
    visibility: row.visibility,
    hidden: row.hiddenAt !== null,
    deleted: row.deletedAt !== null,
    editedAt: row.editedAt,
    createdAt: row.createdAt,
    replies: [],
  };
}

builder.mutationFields((t) => ({
  addComment: t.field({
    type: CommentType,
    args: {
      topicId: t.arg.string({ required: true }),
      body: t.arg.string({ required: true }),
      visibility: t.arg.string({ required: false }),
    },
    resolve: async (_p, args, ctx) => {
      const user = await requireUser(ctx);
      const { topic, viewer } = await loadTopicAndViewer(ctx, args.topicId);
      const visibility: CommentVisibility =
        args.visibility === "host_only"
          ? "host_only"
          : args.visibility === "admin_only"
            ? "admin_only"
            : "public";
      assertMayComment(viewer, topic, user.id, visibility);
      await assertHostThreadOpen(topic.timetableId, visibility);
      const body = requireBody(args.body);
      await assertActionLimit(user.id, "comment");
      const comment = await addComment(topic.id, user.id, body, visibility);
      return commentNode(comment, topic.timetableId);
    },
  }),

  replyToComment: t.field({
    type: CommentType,
    args: {
      commentId: t.arg.string({ required: true }),
      body: t.arg.string({ required: true }),
    },
    resolve: async (_p, args, ctx) => {
      const user = await requireUser(ctx);
      const parent = await getCommentById(args.commentId);
      if (!parent) notFound("Comment not found");
      const { topic, viewer } = await loadTopicAndViewer(ctx, parent.topicId);
      assertMayComment(viewer, topic, user.id, parent.visibility);
      await assertHostThreadOpen(topic.timetableId, parent.visibility);
      const body = requireBody(args.body);
      await assertActionLimit(user.id, "comment");
      const reply = await addReply(parent, user.id, body);
      return commentNode(reply, topic.timetableId);
    },
  }),

  hideComment: t.field({
    type: CommentType,
    args: {
      commentId: t.arg.string({ required: true }),
      hidden: t.arg.boolean({ required: true }),
    },
    resolve: async (_p, args, ctx) => {
      const user = await requireUser(ctx);
      const parent = await getCommentById(args.commentId);
      if (!parent) notFound("Comment not found");
      const { topic, viewer } = await loadTopicAndViewer(ctx, parent.topicId);
      if (!canModerate(viewer)) forbidden("Admins only");
      const updated = await setCommentHidden(parent.id, args.hidden, user.id);
      if (!updated) notFound("Comment not found");
      return commentNode(updated, topic.timetableId);
    },
  }),
}));

// Author self-service (QA 2026-07-29) — separate block from the
// add/reply/moderate set above (max-lines budget).
builder.mutationFields((t) => ({
  /** Author-only body edit. No time limit: comments carry no hearts, so
   * there's no vote-integrity concern. */
  editComment: t.field({
    type: CommentType,
    args: {
      commentId: t.arg.string({ required: true }),
      body: t.arg.string({ required: true }),
    },
    resolve: async (_p, args, ctx) => {
      const user = await requireUser(ctx);
      const existing = await getCommentById(args.commentId);
      if (!existing || existing.deletedAt) notFound("Comment not found");
      if (existing.authorId !== user.id) {
        forbidden("You can only edit your own comments");
      }
      const body = requireBody(args.body);
      const updated = await updateCommentBody(existing.id, body);
      if (!updated) notFound("Comment not found");
      // Deliberately no loadTopicAndViewer: editing your own comment needs
      // no topic guards — the payload alone wants the forum id (for roles),
      // and a missing topic just blanks them instead of failing the edit.
      const topic = await getTopicById(updated.topicId);
      return commentNode(updated, topic?.timetableId ?? null);
    },
  }),

  /** Author-only soft delete: tombstones under replies, vanishes
   * otherwise. Admin moderation stays on hideComment. */
  deleteComment: t.field({
    type: "Boolean",
    args: { commentId: t.arg.string({ required: true }) },
    resolve: async (_p, args, ctx) => {
      const user = await requireUser(ctx);
      const existing = await getCommentById(args.commentId);
      if (!existing || existing.deletedAt) notFound("Comment not found");
      if (existing.authorId !== user.id) {
        forbidden("You can only delete your own comments");
      }
      await softDeleteComment(existing.id);
      return true;
    },
  }),
}));
