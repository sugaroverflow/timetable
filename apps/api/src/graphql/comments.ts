import { GraphQLError } from "graphql";

import {
  addComment,
  addReply,
  getCommentById,
  getUserById,
  setCommentHidden,
  softDeleteComment,
  updateCommentBody,
} from "@timetable/core";
import { canComment, canModerate, canSeeHostOnly } from "@timetable/shared";

import { assertActionLimit } from "../http/action-limits";
import { builder } from "./builder";
import { forbidden, loadTopicAndViewer, notFound, requireUser } from "./guards";
import { CommentType } from "./types";

builder.mutationFields((t) => ({
  addComment: t.field({
    type: CommentType,
    args: {
      topicId: t.arg.string({ required: true }),
      body: t.arg.string({ required: true }),
      visibility: t.arg.string({ required: false }),
    },
    // eslint-disable-next-line complexity, sonarjs/cognitive-complexity -- audit debt (2026-07-22): the per-visibility permission ladder; decomposition queued
    resolve: async (_p, args, ctx) => {
      const user = await requireUser(ctx);
      const { topic, viewer } = await loadTopicAndViewer(ctx, args.topicId);
      const visibility =
        args.visibility === "host_only"
          ? "host_only"
          : args.visibility === "admin_only"
            ? "admin_only"
            : "public";
      if (visibility === "admin_only") {
        // The drafting thread: admins and the topic's owner only
        // (QA #59 round 3).
        if (!canModerate(viewer) && topic.hostId !== user.id) {
          forbidden("Admins and the topic owner only");
        }
      } else if (visibility === "host_only") {
        if (!canSeeHostOnly(viewer)) forbidden("Hosts/admins only");
      } else {
        if (!canComment(viewer)) forbidden("Members only");
        // Public comments are only allowed on published topics.
        if (topic.status !== "published") {
          forbidden("This topic isn't open for comments yet");
        }
      }
      const body = args.body.trim();
      if (!body) throw new GraphQLError("Comment cannot be empty");
      await assertActionLimit(user.id, "comment");
      const comment = await addComment(topic.id, user.id, body, visibility);
      const author = await getUserById(user.id);
      return {
        id: comment.id,
        parentId: comment.parentId,
        authorId: comment.authorId,
        authorName: author?.name ?? null,
        authorImage: author?.image ?? null,
        body: comment.body,
        visibility: comment.visibility,
        hidden: false,
        deleted: false,
        editedAt: null,
        createdAt: comment.createdAt,
        replies: [],
      };
    },
  }),

  replyToComment: t.field({
    type: CommentType,
    args: {
      commentId: t.arg.string({ required: true }),
      body: t.arg.string({ required: true }),
    },
    // eslint-disable-next-line complexity -- audit debt (2026-07-22): the per-visibility permission ladder; decomposition queued
    resolve: async (_p, args, ctx) => {
      const user = await requireUser(ctx);
      const parent = await getCommentById(args.commentId);
      if (!parent) notFound("Comment not found");
      const { topic, viewer } = await loadTopicAndViewer(ctx, parent.topicId);
      if (parent.visibility === "admin_only") {
        if (!canModerate(viewer) && topic.hostId !== user.id) {
          forbidden("Admins and the topic owner only");
        }
      } else if (parent.visibility === "host_only") {
        if (!canSeeHostOnly(viewer)) forbidden("Hosts/admins only");
      } else if (!canComment(viewer)) {
        forbidden("Members only");
      } else if (topic.status !== "published") {
        forbidden("This topic isn't open for comments yet");
      }
      const body = args.body.trim();
      if (!body) throw new GraphQLError("Reply cannot be empty");
      await assertActionLimit(user.id, "comment");
      const reply = await addReply(parent, user.id, body);
      const author = await getUserById(user.id);
      return {
        id: reply.id,
        parentId: reply.parentId,
        authorId: reply.authorId,
        authorName: author?.name ?? null,
        authorImage: author?.image ?? null,
        body: reply.body,
        visibility: reply.visibility,
        hidden: false,
        deleted: false,
        editedAt: null,
        createdAt: reply.createdAt,
        replies: [],
      };
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
      const { viewer } = await loadTopicAndViewer(ctx, parent.topicId);
      if (!canModerate(viewer)) forbidden("Admins only");
      const updated = await setCommentHidden(parent.id, args.hidden, user.id);
      if (!updated) notFound("Comment not found");
      const author = await getUserById(updated.authorId);
      return {
        id: updated.id,
        parentId: updated.parentId,
        authorId: updated.authorId,
        authorName: author?.name ?? null,
        authorImage: author?.image ?? null,
        body: updated.body,
        visibility: updated.visibility,
        hidden: updated.hiddenAt !== null,
        deleted: updated.deletedAt !== null,
        editedAt: updated.editedAt,
        createdAt: updated.createdAt,
        replies: [],
      };
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
      const body = args.body.trim();
      if (!body) throw new GraphQLError("Comment cannot be empty");
      const updated = await updateCommentBody(existing.id, body);
      if (!updated) notFound("Comment not found");
      const author = await getUserById(updated.authorId);
      return {
        id: updated.id,
        parentId: updated.parentId,
        authorId: updated.authorId,
        authorName: author?.name ?? null,
        authorImage: author?.image ?? null,
        body: updated.body,
        visibility: updated.visibility,
        hidden: updated.hiddenAt !== null,
        deleted: false,
        editedAt: updated.editedAt,
        createdAt: updated.createdAt,
        replies: [],
      };
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
