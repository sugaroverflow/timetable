import { GraphQLError } from "graphql";

import {
  buildFeed,
  type FeedSort,
  createTopic,
  deleteTopic,
  getPerson,
  getTimetableById,
  getTopicBySlug,
  getTopicQueue,
  getWeightedBreakdown,
  listCommentTree,
  listCommentTreesForTopics,
  listHostTopics,
  listSubmittedTopics,
  listTimetableHosts,
  logActivity,
  markTopicSeen,
  moderateTopic,
  reassignTopic,
  listTopicHostHearters,
  listViewerHostHeartedTopicIds,
  restartQueueRound,
  setTopicReady,
  submitTopic,
  toggleHeart,
  toggleHostHeart,
  unpublishTopic,
  updateTopic,
  type CommentNode,
  type FeedTopic,
  type HostHearter,
  type TopicQueueState,
} from "@timetable/core";
import type { Topic } from "@timetable/db";
import {
  canEditTopic,
  canHeart,
  canHostHeart,
  canUseQueue,
  canModerate,
  canProposeTopics,
  canPublishTopicDirectly,
  canSeeComments,
  canSeeHostOnly,
  isAdmin,
  isHostCommentsEnabled,
  ownsTopicAsHost,
  type Privacy,
  type Viewer,
} from "@timetable/shared";

import { assertActionLimit } from "../http/action-limits";
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
  /** Host 💙s (2026-08-04): the forum's host-only-thread option, and the
   * viewer's own 💙 state (prefetched in one batched query per page).
   * Unset means false — anonymous/elector viewers never load them. */
  hostCommentsEnabled?: boolean;
  viewerHasHostHearted?: boolean;
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

/** One attributed 💙 in the host-only thread's "💙 Sarah, Amir" row. */
const HostHearterType = builder
  .objectRef<HostHearter>("HostHearter")
  .implement({
    fields: (t) => ({
      userId: t.exposeID("userId"),
      name: t.exposeString("name", { nullable: true }),
      image: t.exposeString("image", { nullable: true }),
      slug: t.exposeString("slug", { nullable: true }),
      heartedAt: t.string({ resolve: (h) => h.heartedAt.toISOString() }),
    }),
  });

const TopicType = builder.objectRef<GqlTopic>("Topic").implement({
  fields: (t) => ({
    id: t.exposeID("id"),
    forumId: t.exposeID("timetableId"),
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
    /** The viewer's own 💙 (host-non-electors only; false otherwise). */
    viewerHasHostHearted: t.boolean({
      resolve: (tp) => tp.viewerHasHostHearted ?? false,
    }),
    /** Attributed 💙s for the host-only thread row — hosts/admins only,
     * and only while the forum's host-only thread is switched on (with it
     * off, 💙s are admin-analysis-only bookmarks). */
    hostHearters: t.field({
      type: [HostHearterType],
      nullable: true,
      resolve: (tp) => {
        if (!tp.canSeeHostOnly || !(tp.hostCommentsEnabled ?? false)) {
          return null;
        }
        return listTopicHostHearters(tp.timetableId, tp.id);
      },
    }),
    commentCount: t.int({
      resolve: (tp) => (tp.canSeeComments ? tp.commentCount : 0),
    }),
    /** The viewer's comments-seen watermark for this topic — set on
     * engagement (teaser expand / permalink view), drives the teaser's
     * "new" previews. Null = never engaged (or signed out). */
    viewerCommentsSeenAt: t.string({
      nullable: true,
      resolve: (tp) => tp.viewerCommentsSeenAt?.toISOString() ?? null,
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
    // Per-elector breakdown — any signed-in viewer, matching the
    // topicWeightedBreakdown query (QA 2026-07-27).
    weightedBreakdown: t.field({
      type: [WeightedHeartType],
      nullable: true,
      resolve: async (tp, _args, ctx) => {
        if (!ctx.user) return null;
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
            includeHostOnly:
              tp.canSeeHostOnly && (tp.hostCommentsEnabled ?? false),
            includeHidden: tp.canModerate,
          })
        );
      },
    }),
    /** The drafting thread — only the topic's owner and admins ever
     * receive it; everyone else gets []. Lets the permalink page render
     * every comment tier (QA 2026-07-28), so notification deep links have
     * one home. */
    adminComments: t.field({
      type: [CommentType],
      resolve: async (tp, _args, ctx) => {
        if (!(tp.canModerate || ctx.user?.id === tp.hostId)) return [];
        const tree = await listCommentTree(tp.id, {
          includeHostOnly: false,
          includeAdminOnly: true,
          includeHidden: false,
        });
        return tree.filter((c) => c.visibility === "admin_only");
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
      forumId: t.exposeID("timetableId"),
      hostId: t.exposeID("hostId"),
      slug: t.exposeString("slug", { nullable: true }),
      hostSlug: t.string({
        nullable: true,
        resolve: async (tp) =>
          (await getPerson(tp.timetableId, tp.hostId))?.slug ?? null,
      }),
      title: t.exposeString("title"),
      bodyMd: t.exposeString("bodyMd"),
      bodyHtml: t.string({ resolve: (tp) => renderMarkdown(tp.bodyMd) }),
      status: t.exposeString("status"),
      updatedAt: t.string({ resolve: (tp) => tp.updatedAt.toISOString() }),
      /** Host's "Ready to publish" signal — null while still drafting. */
      readyAt: t.string({
        nullable: true,
        resolve: (tp) => tp.readyAt?.toISOString() ?? null,
      }),
      hostName: t.string({
        nullable: true,
        resolve: async (tp) =>
          (await getPerson(tp.timetableId, tp.hostId))?.name ?? null,
      }),
      hostImage: t.string({
        nullable: true,
        resolve: async (tp) =>
          (await getPerson(tp.timetableId, tp.hostId))?.image ?? null,
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
      /** Attributed 💙s for the host-only box on My Topics — the
       * recipient's view of who 💙'd their topic (host hearts, QA
       * 2026-08-04). Null while the forum's host-only thread is off. */
      hostHearters: t.field({
        type: [HostHearterType],
        nullable: true,
        resolve: async (tp) => {
          const timetable = await getTimetableById(tp.timetableId);
          if (timetable && !isHostCommentsEnabled(timetable.settings)) {
            return null;
          }
          return listTopicHostHearters(tp.timetableId, tp.id);
        },
      }),
      /** Host-only thread. ManagedTopic is only ever served to the owning
       * host or admins, so this is safe. Empty when the forum has switched
       * the host-only thread off (hide, never delete). */
      hostOnlyComments: t.field({
        type: [CommentType],
        resolve: async (tp) => {
          const timetable = await getTimetableById(tp.timetableId);
          if (timetable && !isHostCommentsEnabled(timetable.settings)) {
            return [];
          }
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

/** The viewer's 💙'd subset of `topicIds` — empty unless they're an
 * eligible host (host-non-elector), so elector/anonymous pages never pay
 * the extra query. */
async function viewerHostHeartedSet(
  userId: string | null,
  viewer: Viewer,
  topicIds: string[],
): Promise<Set<string>> {
  if (!userId || !canHostHeart(viewer)) return new Set();
  return listViewerHostHeartedTopicIds(userId, topicIds);
}

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
      hostHeartedByMe: t.arg.boolean({ required: false }),
      heartedBy: t.arg.string({ required: false }),
      q: t.arg.string({ required: false }),
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
      const hostThreadOn = isHostCommentsEnabled(readable.timetable.settings);
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
        "created",
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
          hostHeartedByViewer: Boolean(args.hostHeartedByMe),
          heartedBy: args.heartedBy ?? undefined,
          q: args.q ?? undefined,
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
            {
              includeHostOnly: hostOnly && hostThreadOn,
              includeHidden: moderate,
            },
          )
        : new Map<string, CommentNode[]>();
      const viewerHostHearted = await viewerHostHeartedSet(
        ctx.user?.id ?? null,
        viewer,
        feed.map((tp) => tp.id),
      );
      return feed.map((tp) => ({
        ...tp,
        canSeeHostOnly: hostOnly,
        canModerate: moderate,
        canSeeComments: seeComments,
        hostCommentsEnabled: hostThreadOn,
        viewerHasHostHearted: viewerHostHearted.has(tp.id),
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
        const viewerHostHearted = await viewerHostHeartedSet(
          ctx.user?.id ?? null,
          viewer,
          [topic.id],
        );
        return {
          ...feedTopic,
          canSeeHostOnly: hostOnly,
          canModerate: moderate,
          canSeeComments: seeComments,
          hostCommentsEnabled: isHostCommentsEnabled(
            readable.timetable.settings,
          ),
          viewerHasHostHearted: viewerHostHearted.has(topic.id),
        };
      }

      // Not published: owner or admin only, with empty heart data.
      const isOwner = ctx.user?.id === topic.hostId;
      if (!isOwner && !moderate) return null;
      const host = await getPerson(topic.timetableId, topic.hostId);
      return {
        id: topic.id,
        timetableId: topic.timetableId,
        hostId: topic.hostId,
        hostName: host?.name ?? null,
        hostImage: host?.image ?? null,
        hostSlug: host?.slug ?? null,
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
        viewerCommentsSeenAt: null,
        canSeeHostOnly: hostOnly,
        canModerate: moderate,
        canSeeComments: seeComments,
      };
    },
  }),

  /** Hosts in a timetable (for the feed's host filter). */
  forumHosts: t.field({
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

      await assertActionLimit(user.id, "topic");
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
      } else {
        await logActivity({
          timetableId: readable.timetable.id,
          actorId: user.id,
          action: "topic.create",
          payload: { topicId: created.id, title: created.title },
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
      if (!canEditTopic(viewer, topic.hostId)) forbidden();
      const updated = await updateTopic(topic.id, {
        title: args.title ?? undefined,
        bodyMd: args.bodyMd ?? undefined,
        coverImageUrl:
          args.coverImageUrl != null
            ? args.coverImageUrl.trim() || null
            : undefined,
      });
      if (!updated) notFound("Topic not found");
      // Log every edit — a host editing their own topic as well as an admin
      // editing someone else's (QA 2026-07-30; was admin-only before).
      await logActivity({
        timetableId: topic.timetableId,
        actorId: user.id,
        action: "topic.edit",
        payload: { topicId: topic.id, title: updated.title },
      });
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
      if (!canEditTopic(viewer, topic.hostId)) forbidden();
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
      if (!canEditTopic(viewer, topic.hostId)) forbidden();
      const updated = await unpublishTopic(topic, user.id);
      if (!updated) notFound("Topic not found");
      return updated;
    },
  }),

  /** Host (or admin) flips a pending topic's "Ready to publish" switch —
   * the signal the admin Pending queue's default view filters on. */
  setTopicReady: t.field({
    type: ManagedTopicType,
    args: {
      topicId: t.arg.string({ required: true }),
      ready: t.arg.boolean({ required: true }),
    },
    resolve: async (_p, args, ctx) => {
      const user = await requireUser(ctx);
      const { topic, viewer } = await loadTopicAndViewer(ctx, args.topicId);
      if (!canEditTopic(viewer, topic.hostId)) forbidden();
      if (topic.status !== "submitted") {
        throw new GraphQLError("Only a pending topic can be marked ready");
      }
      const updated = await setTopicReady(topic, user.id, args.ready);
      if (!updated) notFound("Topic not found");
      return updated;
    },
  }),

  /** Host permanently deletes their own not-yet-published topic (launch QA
   * 2026-07-29). Owner-only — admins reject/unpublish instead. Published
   * and archived topics refuse: unpublish first, so nothing with public
   * hearts/comments vanishes in one click. */
  deleteTopic: t.boolean({
    args: { topicId: t.arg.string({ required: true }) },
    resolve: async (_p, args, ctx) => {
      const user = await requireUser(ctx);
      const { topic, viewer } = await loadTopicAndViewer(ctx, args.topicId);
      if (!ownsTopicAsHost(viewer, topic.hostId)) forbidden();
      if (topic.status !== "unpublished" && topic.status !== "submitted") {
        throw new GraphQLError("Only not-yet-published topics can be deleted");
      }
      await deleteTopic(topic, user.id);
      return true;
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
      const action = args.action;
      if (action !== "publish" && action !== "reject") {
        throw new GraphQLError("Invalid review action");
      }
      if (!canModerate(viewer)) {
        // Hosts may publish (never reject) their own topic directly when
        // the forum opted in — admin review becomes after-the-fact
        // oversight; the publish is still activity-logged.
        const timetable = await getTimetableById(topic.timetableId);
        const direct =
          action === "publish" &&
          timetable &&
          canPublishTopicDirectly(viewer, timetable.settings, topic.hostId);
        if (!direct) forbidden("Admins only");
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

  /** Toggle the viewer's 💙 (host hearts, 2026-08-04). Host-non-electors
   * only — a dual-role member's ❤️ is their gesture. Works in every forum
   * (with the host-only thread off it's a private bookmark). */
  hostHeartTopic: t.field({
    type: HeartResult,
    args: { topicId: t.arg.string({ required: true }) },
    resolve: async (_p, args, ctx) => {
      const user = await requireUser(ctx);
      const { topic, viewer } = await loadTopicAndViewer(ctx, args.topicId);
      if (!canHostHeart(viewer)) forbidden("Hosts who aren't electors only");
      const { hearted } = await toggleHostHeart(topic.id, user.id);
      return { topicId: topic.id, hearted };
    },
  }),
}));

// ---------------------------------------------------------------------------
// Topic Queue (2026-07-28): elector-only, one topic at a time — see
// packages/core/src/queue.ts for the mechanics.
// ---------------------------------------------------------------------------

type GqlTopicQueue = TopicQueueState & { current: GqlTopic | null };

const TopicQueueType = builder
  .objectRef<GqlTopicQueue>("TopicQueue")
  .implement({
    fields: (t) => ({
      /** Unseen this round (includes the new ones). */
      remaining: t.exposeInt("remaining"),
      /** Subset of remaining published after the round started. */
      remainingNew: t.exposeInt("remainingNew"),
      /** All unhearted published topics in the current round. */
      roundSize: t.exposeInt("roundSize"),
      /** Published topics never seen nor ❤️'d (the sidebar badge). */
      neverSeenCount: t.exposeInt("neverSeenCount"),
      current: t.field({
        type: TopicType,
        nullable: true,
        resolve: (q) => q.current,
      }),
    }),
  });

builder.queryFields((t) => ({
  /** The viewer's Topic Queue. Null for guests and non-members; every
   * member gets one (v2 2026-07-29 — hosts read through, electors vote).
   * The forum's heartsCountFrom cutoff resets everyone's review state. */
  topicQueue: t.field({
    type: TopicQueueType,
    nullable: true,
    args: { idOrSlug: t.arg.string({ required: true }) },
    resolve: async (_p, args, ctx) => {
      if (!ctx.user) return null;
      const readable = await readTimetable(ctx, args.idOrSlug);
      if (!readable) return null;
      const viewer = await ctx.getViewer(readable.timetable.id);
      if (!canUseQueue(viewer)) return null;

      const state = await getTopicQueue(
        readable.timetable.id,
        ctx.user.id,
        readable.timetable.heartsCountFrom,
      );
      let current: GqlTopic | null = null;
      if (state.currentTopicId) {
        const [topic] = await buildFeed(readable.timetable.id, ctx.user.id, {
          topicId: state.currentTopicId,
        });
        if (topic) {
          const viewerHostHearted = await viewerHostHeartedSet(
            ctx.user.id,
            viewer,
            [topic.id],
          );
          current = {
            ...topic,
            canSeeHostOnly: canSeeHostOnly(viewer),
            canModerate: canModerate(viewer),
            canSeeComments: canSeeComments(
              readable.timetable.privacy as Privacy,
              viewer,
            ),
            hostCommentsEnabled: isHostCommentsEnabled(
              readable.timetable.settings,
            ),
            viewerHasHostHearted: viewerHostHearted.has(topic.id),
          };
        }
      }
      return { ...state, current };
    },
  }),
}));

builder.mutationFields((t) => ({
  /** The queue's Next button: record the topic as seen this round and
   * move on. */
  queueMarkSeen: t.boolean({
    args: { topicId: t.arg.string({ required: true }) },
    resolve: async (_p, args, ctx) => {
      const user = await requireUser(ctx);
      const { topic, viewer } = await loadTopicAndViewer(ctx, args.topicId);
      if (!canUseQueue(viewer)) forbidden("Members only");
      if (topic.status !== "published") {
        throw new GraphQLError("Only published topics can be queued");
      }
      await markTopicSeen(topic.id, user.id);
      // Reaching the end of a round is the meaningful "I've reviewed
      // everything" moment — log it once, when this Next empties the queue.
      const tt = await getTimetableById(topic.timetableId);
      const state = await getTopicQueue(
        topic.timetableId,
        user.id,
        tt?.heartsCountFrom ?? null,
      );
      if (state.remaining === 0) {
        await logActivity({
          timetableId: topic.timetableId,
          actorId: user.id,
          action: "queue.finish",
          payload: { roundSize: state.roundSize },
        });
      }
      return true;
    },
  }),

  /** End-of-round "Start another round": every published topic comes
   * around again. */
  queueRestartRound: t.boolean({
    args: { idOrSlug: t.arg.string({ required: true }) },
    resolve: async (_p, args, ctx) => {
      const { user, readable, viewer } = await loadTimetableAndViewer(
        ctx,
        args.idOrSlug,
      );
      if (!canUseQueue(viewer)) forbidden("Members only");
      return restartQueueRound(readable.timetable.id, user.id);
    },
  }),
}));
