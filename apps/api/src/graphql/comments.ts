import { GraphQLError } from "graphql";

import {
  addComment,
  addReply,
  getCommentById,
  getUserById,
  setCommentHidden,
} from "@timetable/core";
import { canComment, canModerate, canSeeHostOnly } from "@timetable/shared";

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
        createdAt: updated.createdAt,
        replies: [],
      };
    },
  }),
}));
