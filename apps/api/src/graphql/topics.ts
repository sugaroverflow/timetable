import { GraphQLError } from "graphql";

import {
  buildFeed,
  type FeedSort,
  createTopic,
  getOrCreateUserSlug,
  getTopicBySlug,
  getUserById,
  getWeightedBreakdown,
  listCommentTree,
  listCommentTreesForTopics,
  listHostTopics,
  listSubmittedTopics,
  listTimetableHosts,
  logActivity,
  moderateTopic,
  reassignTopic,
  submitTopic,
  toggleHeart,
  unpublishTopic,
  updateTopic,
  type CommentNode,
  type FeedTopic,
} from "@timetable/core";
import type { Topic } from "@timetable/db";
import {
  canHeart,
  canModerate,
  canProposeTopics,
  canSeeComments,
  canSeeHostOnly,
  isAdmin,
  isHost,
  type Privacy,
} from "@timetable/shared";

import { renderMarkdown } from "../markdown";
import { builder } from "./builder";
import {
  assertCanOwnTopic,
  forbidden,
  loadTimetableAndViewer,
  loadTopicAndViewer,
  notFound,
  readTimetable,
  requireUser,
} from "./guards";
import { CommentType, WeightedHeartType } from "./types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type GqlTopic = FeedTopic & {
  canSeeHostOnly: boolean;
  canModerate: boolean;
  canSeeComments: boolean;
  /** Comment trees prefetched in one batched query by list resolvers
   * (topicFeed); single-topic paths leave it unset and the field resolver
   * falls back to a per-topic query. */
  prefetchedComments?: CommentNode[];
};

/** ManagedTopic rows with the three comment threads optionally prefetched
 * (hostDashboard batches them; other paths fall back per topic). */
type GqlManagedTopic = Topic & {
  prefetchedComments?: CommentNode[];
  prefetchedHostOnlyComments?: CommentNode[];
  prefetchedAdminComments?: CommentNode[];
};

const HostOptionType = builder
  .objectRef<{ id: string; name: string | null }>("HostOption")
  .implement({
    fields: (t) => ({
      id: t.exposeID("id"),
      name: t.exposeString("name", { nullable: true }),
    }),
  });

const TopicType = builder.objectRef<GqlTopic>("Topic").implement({
  fields: (t) => ({
    id: t.exposeID("id"),
    timetableId: t.exposeID("timetableId"),
    hostId: t.exposeID("hostId"),
    hostName: t.exposeString("hostName", { nullable: true }),
    hostImage: t.exposeString("hostImage", { nullable: true }),
    hostSlug: t.exposeString("hostSlug", { nullable: true }),
    title: t.exposeString("title"),
    slug: t.exposeString("slug", { nullable: true }),
    bodyMd: t.exposeString("bodyMd"),
    bodyHtml: t.string({ resolve: (tp) => renderMarkdown(tp.bodyMd) }),
    coverImageUrl: t.exposeString("coverImageUrl", { nullable: true }),
    status: t.exposeString("status"),
    heartCount: t.exposeInt("heartCount"),
    viewerHasHearted: t.exposeBoolean("viewerHasHearted"),
    commentCount: t.int({
      resolve: (tp) => (tp.canSeeComments ? tp.commentCount : 0),
    }),
    publishedAt: t.string({
      nullable: true,
      resolve: (tp) => tp.publishedAt?.toISOString() ?? null,
    }),
    contentUpdatedAt: t.string({
      nullable: true,
      resolve: (tp) => tp.contentUpdatedAt?.toISOString() ?? null,
    }),
    createdAt: t.string({ resolve: (tp) => tp.createdAt.toISOString() }),
    // Weighted score is host/admin-only. weightedScore is the L1 norm; the
    // L2 and average-devotion norms power the Analysis switcher + feed sorts.
    weightedScore: t.float({
      nullable: true,
      resolve: (tp) => (tp.canSeeHostOnly ? tp.weightedScore : null),
    }),
    l2Score: t.float({
      nullable: true,
      resolve: (tp) => (tp.canSeeHostOnly ? tp.l2Score : null),
    }),
    devotionScore: t.float({
      nullable: true,
      resolve: (tp) => (tp.canSeeHostOnly ? tp.devotionScore : null),
    }),
    // Per-elector breakdown, host/admin-only.
    weightedBreakdown: t.field({
      type: [WeightedHeartType],
      nullable: true,
      resolve: async (tp) => {
        if (!tp.canSeeHostOnly) return null;
        return getWeightedBreakdown(tp.timetableId, tp.id);
      },
    }),
    comments: t.field({
      type: [CommentType],
      resolve: (tp) => {
        if (!tp.canSeeComments) return [];
        return (
          tp.prefetchedComments ??
          listCommentTree(tp.id, {
            includeHostOnly: tp.canSeeHostOnly,
            includeHidden: tp.canModerate,
          })
        );
      },
    }),
  }),
});

/** Prefetch the three ManagedTopic comment threads for a page of topics in
 * three batched queries instead of three per topic (hostDashboard). Applies
 * the same root-visibility filters as the per-field fallbacks below. */
async function attachManagedCommentTrees(
  rows: Topic[],
): Promise<GqlManagedTopic[]> {
  const ids = rows.map((tp) => tp.id);
  const [publicTrees, hostTrees, adminTrees] = await Promise.all([
    listCommentTreesForTopics(ids, {
      includeHostOnly: false,
      includeHidden: false,
    }),
    listCommentTreesForTopics(ids, {
      includeHostOnly: true,
      includeHidden: false,
    }),
    listCommentTreesForTopics(ids, {
      includeHostOnly: false,
      includeAdminOnly: true,
      includeHidden: false,
    }),
  ]);
  return rows.map((tp) => ({
    ...tp,
    prefetchedComments: publicTrees.get(tp.id) ?? [],
    prefetchedHostOnlyComments: (hostTrees.get(tp.id) ?? []).filter(
      (c) => c.visibility === "host_only",
    ),
    prefetchedAdminComments: (adminTrees.get(tp.id) ?? []).filter(
      (c) => c.visibility === "admin_only",
    ),
  }));
}

const ManagedTopicType = builder
  .objectRef<GqlManagedTopic>("ManagedTopic")
  .implement({
    fields: (t) => ({
      id: t.exposeID("id"),
      timetableId: t.exposeID("timetableId"),
      hostId: t.exposeID("hostId"),
      slug: t.exposeString("slug", { nullable: true }),
      hostSlug: t.string({
        nullable: true,
        resolve: (tp) => getOrCreateUserSlug(tp.hostId),
      }),
      title: t.exposeString("title"),
      bodyMd: t.exposeString("bodyMd"),
      bodyHtml: t.string({ resolve: (tp) => renderMarkdown(tp.bodyMd) }),
      status: t.exposeString("status"),
      updatedAt: t.string({ resolve: (tp) => tp.updatedAt.toISOString() }),
      hostName: t.string({
        nullable: true,
        resolve: async (tp) => (await getUserById(tp.hostId))?.name ?? null,
      }),
      /** Public comment thread — lets My Topics render feed-identical cards
       * (QA #59). */
      comments: t.field({
        type: [CommentType],
        resolve: (tp) =>
          tp.prefetchedComments ??
          listCommentTree(tp.id, {
            includeHostOnly: false,
            includeHidden: false,
          }),
      }),
      /** Host-only thread. ManagedTopic is only ever served to the owning
       * host or admins, so this is safe. */
      hostOnlyComments: t.field({
        type: [CommentType],
        resolve: async (tp) => {
          if (tp.prefetchedHostOnlyComments)
            return tp.prefetchedHostOnlyComments;
          const tree = await listCommentTree(tp.id, {
            includeHostOnly: true,
            includeHidden: false,
          });
          return tree.filter((c) => c.visibility === "host_only");
        },
      }),
      /** The drafting thread (QA #59 round 3): admins + topic owner only.
       * Rendered on Pending Topics (admins) and My Topics (owner), never in
       * the feed. */
      adminComments: t.field({
        type: [CommentType],
        resolve: async (tp) => {
          if (tp.prefetchedAdminComments) return tp.prefetchedAdminComments;
          const tree = await listCommentTree(tp.id, {
            includeHostOnly: false,
            includeAdminOnly: true,
            includeHidden: false,
          });
          return tree.filter((c) => c.visibility === "admin_only");
        },
      }),
      coverImageUrl: t.exposeString("coverImageUrl", { nullable: true }),
    }),
  });

const HeartResult = builder
  .objectRef<{ topicId: string; hearted: boolean }>("HeartResult")
  .implement({
    fields: (t) => ({
      topicId: t.exposeID("topicId"),
      hearted: t.exposeBoolean("hearted"),
    }),
  });

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

builder.queryFields((t) => ({
  /** Published topic feed for a timetable (role-aware). */
  topicFeed: t.field({
    type: [TopicType],
    args: {
      idOrSlug: t.arg.string({ required: true }),
      hostId: t.arg.string({ required: false }),
      heartedByMe: t.arg.boolean({ required: false }),
      sort: t.arg.string({ required: false }),
      seed: t.arg.string({ required: false }),
      limit: t.arg.int({ required: false }),
      offset: t.arg.int({ required: false }),
    },
    // eslint-disable-next-line complexity -- audit debt (2026-07-22): sort validation + permission flags in one pass; decomposition queued
    resolve: async (_p, args, ctx) => {
      const readable = await readTimetable(ctx, args.idOrSlug);
      if (!readable) return [];
      const viewer = { userId: ctx.user?.id ?? null, roles: readable.roles };
      const hostOnly = canSeeHostOnly(viewer);
      const moderate = canModerate(viewer);
      const seeComments = canSeeComments(
        readable.timetable.privacy as Privacy,
        viewer,
      );
      const validSorts = new Set<FeedSort>([
        "hearts",
        "raw",
        "l2",
        "l1",
        "devotion",
        "comments",
        "recent",
        "random",
      ]);
      const sort = (
        args.sort && validSorts.has(args.sort as FeedSort)
          ? args.sort
          : "hearts"
      ) as FeedSort;
      const feed = await buildFeed(
        readable.timetable.id,
        ctx.user?.id ?? null,
        {
          hostId: args.hostId ?? undefined,
          heartedByViewer: Boolean(args.heartedByMe),
          sort,
          seed: args.seed ?? undefined,
          limit: args.limit ?? 50,
          offset: args.offset ?? undefined,
        },
      );
      // Batch the page's comment trees into one query instead of one per
      // topic; the Topic.comments resolver serves them from the prefetch.
      const commentTrees = seeComments
        ? await listCommentTreesForTopics(
            feed.map((tp) => tp.id),
            { includeHostOnly: hostOnly, includeHidden: moderate },
          )
        : new Map<string, CommentNode[]>();
      return feed.map((tp) => ({
        ...tp,
        canSeeHostOnly: hostOnly,
        canModerate: moderate,
        canSeeComments: seeComments,
        prefetchedComments: commentTrees.get(tp.id) ?? [],
      }));
    },
  }),

  /** The current user's own topics across all statuses. */
  hostDashboard: t.field({
    type: [ManagedTopicType],
    args: { idOrSlug: t.arg.string({ required: true }) },
    resolve: async (_p, args, ctx) => {
      if (!ctx.user) return [];
      const readable = await readTimetable(ctx, args.idOrSlug);
      if (!readable) return [];
      const rows = await listHostTopics(readable.timetable.id, ctx.user.id);
      return attachManagedCommentTrees(rows);
    },
  }),

  /** Submitted topics awaiting moderation (admin only). */
  moderationQueue: t.field({
    type: [ManagedTopicType],
    args: { idOrSlug: t.arg.string({ required: true }) },
    resolve: async (_p, args, ctx) => {
      const readable = await readTimetable(ctx, args.idOrSlug);
      if (!readable) return [];
      const viewer = { userId: ctx.user?.id ?? null, roles: readable.roles };
      if (!canModerate(viewer)) return [];
      return listSubmittedTopics(readable.timetable.id);
    },
  }),
}));

builder.queryFields((t) => ({
  /** A single topic by its permalink slug. Published topics are visible to
   * anyone who can read the timetable; drafts/submissions only to their
   * owner or admins. */
  topicPermalink: t.field({
    type: TopicType,
    nullable: true,
    args: {
      idOrSlug: t.arg.string({ required: true }),
      topicSlug: t.arg.string({ required: true }),
    },
    // eslint-disable-next-line complexity -- audit debt (2026-07-22): the published/unpublished dual path; decomposition queued
    resolve: async (_p, args, ctx) => {
      const readable = await readTimetable(ctx, args.idOrSlug);
      if (!readable) return null;
      const topic = await getTopicBySlug(readable.timetable.id, args.topicSlug);
      if (!topic) return null;
      const viewer = { userId: ctx.user?.id ?? null, roles: readable.roles };
      const hostOnly = canSeeHostOnly(viewer);
      const moderate = canModerate(viewer);
      const seeComments = canSeeComments(
        readable.timetable.privacy as Privacy,
        viewer,
      );

      if (topic.status === "published") {
        const [feedTopic] = await buildFeed(
          readable.timetable.id,
          ctx.user?.id ?? null,
          { topicId: topic.id },
        );
        if (!feedTopic) return null;
        return {
          ...feedTopic,
          canSeeHostOnly: hostOnly,
          canModerate: moderate,
          canSeeComments: seeComments,
        };
      }

      // Not published: owner or admin only, with empty heart data.
      const isOwner = ctx.user?.id === topic.hostId;
      if (!isOwner && !moderate) return null;
      const host = await getUserById(topic.hostId);
      return {
        id: topic.id,
        timetableId: topic.timetableId,
        hostId: topic.hostId,
        hostName: host?.name ?? null,
        hostImage: host?.image ?? null,
        hostSlug: await getOrCreateUserSlug(topic.hostId),
        title: topic.title,
        slug: topic.slug,
        bodyMd: topic.bodyMd,
        coverImageUrl: topic.coverImageUrl,
        status: topic.status,
        publishedAt: topic.publishedAt,
        contentUpdatedAt: topic.contentUpdatedAt,
        createdAt: topic.createdAt,
        heartCount: 0,
        weightedScore: 0,
        l2Score: 0,
        devotionScore: 0,
        viewerHasHearted: false,
        commentCount: 0,
        latestCommentAt: null,
        canSeeHostOnly: hostOnly,
        canModerate: moderate,
        canSeeComments: seeComments,
      };
    },
  }),

  /** Hosts in a timetable (for the feed's host filter). */
  timetableHosts: t.field({
    type: [HostOptionType],
    args: { idOrSlug: t.arg.string({ required: true }) },
    resolve: async (_p, args, ctx) => {
      const readable = await readTimetable(ctx, args.idOrSlug);
      if (!readable) return [];
      return listTimetableHosts(readable.timetable.id);
    },
  }),
}));

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

builder.mutationFields((t) => ({
  createTopic: t.field({
    type: ManagedTopicType,
    args: {
      idOrSlug: t.arg.string({ required: true }),
      title: t.arg.string({ required: true }),
      bodyMd: t.arg.string({ required: false }),
      coverImageUrl: t.arg.string({ required: false }),
      /** Admin-only: create the topic owned by another host (product
       * feedback round 2 — populate a pre-created account's topics). */
      hostId: t.arg.string({ required: false }),
    },
    resolve: async (_p, args, ctx) => {
      const { user, readable, viewer } = await loadTimetableAndViewer(
        ctx,
        args.idOrSlug,
      );
      if (!canProposeTopics(viewer)) forbidden("Hosts only");

      let hostId = user.id;
      if (args.hostId && args.hostId !== user.id) {
        if (!isAdmin(viewer.roles)) forbidden("Admins only");
        await assertCanOwnTopic(args.hostId, readable.timetable.id);
        hostId = args.hostId;
      }

      const created = await createTopic(readable.timetable.id, hostId, {
        title: args.title,
        bodyMd: args.bodyMd ?? "",
        coverImageUrl:
          args.coverImageUrl != null ? args.coverImageUrl.trim() : undefined,
      });
      if (hostId !== user.id) {
        // Same event shape as reassignTopic so the digest's "assigned to
        // you" section picks up admin-created topics too.
        await logActivity({
          timetableId: readable.timetable.id,
          actorId: user.id,
          action: "topic.reassign",
          payload: {
            topicId: created.id,
            title: created.title,
            previousHostId: user.id,
            newHostId: hostId,
          },
        });
      }
      return created;
    },
  }),

  updateTopic: t.field({
    type: ManagedTopicType,
    args: {
      topicId: t.arg.string({ required: true }),
      title: t.arg.string({ required: false }),
      bodyMd: t.arg.string({ required: false }),
      coverImageUrl: t.arg.string({ required: false }),
    },
    resolve: async (_p, args, ctx) => {
      const user = await requireUser(ctx);
      const { topic, viewer } = await loadTopicAndViewer(ctx, args.topicId);
      const ownerHost = topic.hostId === user.id && isHost(viewer.roles);
      if (!(ownerHost || isAdmin(viewer.roles))) forbidden();
      const updated = await updateTopic(topic.id, {
        title: args.title ?? undefined,
        bodyMd: args.bodyMd ?? undefined,
        coverImageUrl:
          args.coverImageUrl != null
            ? args.coverImageUrl.trim() || null
            : undefined,
      });
      if (!updated) notFound("Topic not found");
      if (!ownerHost) {
        await logActivity({
          timetableId: topic.timetableId,
          actorId: user.id,
          action: "topic.edit",
          payload: { topicId: topic.id, title: updated.title },
        });
      }
      return updated;
    },
  }),

  /** Admin assigns/reassigns a topic's owner to another host or admin. */
  reassignTopic: t.field({
    type: ManagedTopicType,
    args: {
      topicId: t.arg.string({ required: true }),
      hostId: t.arg.string({ required: true }),
    },
    resolve: async (_p, args, ctx) => {
      const user = await requireUser(ctx);
      const { topic, viewer } = await loadTopicAndViewer(ctx, args.topicId);
      if (!isAdmin(viewer.roles)) forbidden();
      await assertCanOwnTopic(args.hostId, topic.timetableId);
      const updated = await reassignTopic(topic, args.hostId, user.id);
      if (!updated) notFound("Topic not found");
      return updated;
    },
  }),
}));

builder.mutationFields((t) => ({
  submitTopic: t.field({
    type: ManagedTopicType,
    args: { topicId: t.arg.string({ required: true }) },
    resolve: async (_p, args, ctx) => {
      const user = await requireUser(ctx);
      const { topic, viewer } = await loadTopicAndViewer(ctx, args.topicId);
      const ownerHost = topic.hostId === user.id && isHost(viewer.roles);
      if (!(ownerHost || isAdmin(viewer.roles))) forbidden();
      if (topic.status !== "unpublished") {
        throw new GraphQLError("Only unpublished topics can be re-submitted");
      }
      const updated = await submitTopic(topic, user.id);
      if (!updated) notFound("Topic not found");
      return updated;
    },
  }),

  unpublishTopic: t.field({
    type: ManagedTopicType,
    args: { topicId: t.arg.string({ required: true }) },
    resolve: async (_p, args, ctx) => {
      const user = await requireUser(ctx);
      const { topic, viewer } = await loadTopicAndViewer(ctx, args.topicId);
      const ownerHost = topic.hostId === user.id && isHost(viewer.roles);
      if (!(ownerHost || isAdmin(viewer.roles))) forbidden();
      const updated = await unpublishTopic(topic, user.id);
      if (!updated) notFound("Topic not found");
      return updated;
    },
  }),

  moderateTopic: t.field({
    type: ManagedTopicType,
    args: {
      topicId: t.arg.string({ required: true }),
      action: t.arg.string({ required: true }),
      note: t.arg.string({ required: false }),
    },
    resolve: async (_p, args, ctx) => {
      const user = await requireUser(ctx);
      const { topic, viewer } = await loadTopicAndViewer(ctx, args.topicId);
      if (!canModerate(viewer)) forbidden("Admins only");
      const action = args.action;
      if (action !== "publish" && action !== "reject") {
        throw new GraphQLError("Invalid moderation action");
      }
      const updated = await moderateTopic(
        topic,
        user.id,
        action,
        args.note ?? undefined,
      );
      if (!updated) notFound("Topic not found");
      return updated;
    },
  }),

  heartTopic: t.field({
    type: HeartResult,
    args: { topicId: t.arg.string({ required: true }) },
    resolve: async (_p, args, ctx) => {
      const user = await requireUser(ctx);
      const { topic, viewer } = await loadTopicAndViewer(ctx, args.topicId);
      if (!canHeart(viewer)) forbidden("Electors only");
      const { hearted } = await toggleHeart(topic.id, user.id);
      return { topicId: topic.id, hearted };
    },
  }),
}));
