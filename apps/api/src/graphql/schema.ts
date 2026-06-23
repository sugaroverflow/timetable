import SchemaBuilder from "@pothos/core";
import { GraphQLError } from "graphql";

import {
  addComment,
  addReply,
  addSlotComment,
  archiveTopicHearts,
  buildCalendar,
  buildFeed,
  claimInvitesForUser,
  createSlots,
  createTopic,
  deleteSlot,
  getAudienceElectorIds,
  getCommentById,
  getDashboard,
  getLatestHostOnlyComment,
  getOrCreateIcsToken,
  getReadableTimetable,
  getSlotById,
  getTimetableById,
  getTimetableByDomain,
  getTopicById,
  getUserById,
  getUserNotificationSettings,
  getViewerRoles,
  getWeightedBreakdown,
  listActivity,
  listCommentTree,
  listHostTopics,
  listMembers,
  listMembershipsForUser,
  listSlotComments,
  listSubmittedTopics,
  listTimetableHosts,
  moderateTopic,
  setAvailability,
  setCommentHidden,
  setWeekdayAvailability,
  submitTopic,
  tagSlotTopic,
  toggleHeart,
  untagSlotTopic,
  unpublishTopic,
  updateSlot,
  updateTimetableProfile,
  updateTimetableSettings,
  updateTopic,
  updateUserNotificationSettings,
  updateUserProfile,
  type ActivityEntry,
  type Audience,
  type CalendarSlot,
  type CommentNode,
  type DashboardData,
  type FeedTopic,
  type WeightedHeartEntry,
} from "@timetable/core";
import type {
  AvailabilityState,
  Timetable,
  TimetableSettings,
  Topic,
} from "@timetable/db";
import {
  canComment,
  canEditSettings,
  canHeart,
  canManageMembers,
  canModerate,
  canProposeTopics,
  canSeeHostOnly,
  isAdmin,
  isElector,
  isHost,
} from "@timetable/shared";

import type { SessionUser } from "../auth/clerk";
import type { ApiContext } from "../context";
import { renderMarkdown } from "../markdown";

// ---------------------------------------------------------------------------
// GraphQL object shapes
// ---------------------------------------------------------------------------

type GqlTimetable = Timetable & { viewerRoles: string[] };
type GqlTimetableRoute = Pick<Timetable, "id" | "slug" | "privacy">;
type GqlMembership = { id: string; roles: string[]; timetable: GqlTimetable };
type GqlMember = {
  membershipId: string;
  roles: string[];
  user: { id: string; name: string | null; email: string | null; image: string | null };
};
type GqlTopic = FeedTopic & { canSeeHostOnly: boolean; canModerate: boolean };

// ---------------------------------------------------------------------------
// Builder + auth helpers
// ---------------------------------------------------------------------------

const builder = new SchemaBuilder<{ Context: ApiContext }>({});

function unauthenticated(): never {
  throw new GraphQLError("Not authenticated", {
    extensions: { code: "UNAUTHENTICATED" },
  });
}

function forbidden(message = "Forbidden"): never {
  throw new GraphQLError(message, { extensions: { code: "FORBIDDEN" } });
}

function notFound(message = "Not found"): never {
  throw new GraphQLError(message, { extensions: { code: "NOT_FOUND" } });
}

async function requireUser(ctx: ApiContext): Promise<SessionUser> {
  if (!ctx.user) unauthenticated();
  return ctx.user;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

const UserType = builder.objectRef<SessionUser>("User").implement({
  fields: (t) => ({
    id: t.exposeID("id"),
    email: t.exposeString("email", { nullable: true }),
    name: t.exposeString("name", { nullable: true }),
    image: t.exposeString("image", { nullable: true }),
    bio: t.exposeString("bio", { nullable: true }),
    notificationSettings: t.string({
      resolve: async (u) =>
        JSON.stringify(await getUserNotificationSettings(u.id)),
    }),
  }),
});

const HostOptionType = builder
  .objectRef<{ id: string; name: string | null }>("HostOption")
  .implement({
    fields: (t) => ({
      id: t.exposeID("id"),
      name: t.exposeString("name", { nullable: true }),
    }),
  });

const TimetableType = builder.objectRef<GqlTimetable>("Timetable").implement({
  fields: (t) => ({
    id: t.exposeID("id"),
    slug: t.exposeString("slug"),
    name: t.exposeString("name"),
    description: t.exposeString("description", { nullable: true }),
    privacy: t.exposeString("privacy"),
    customDomain: t.exposeString("customDomain", { nullable: true }),
    viewerRoles: t.exposeStringList("viewerRoles"),
    settings: t.field({
      type: "String",
      resolve: (tt) => JSON.stringify(tt.settings ?? {}),
    }),
    createdAt: t.string({ resolve: (tt) => tt.createdAt.toISOString() }),
  }),
});

const TimetableRouteType = builder
  .objectRef<GqlTimetableRoute>("TimetableRoute")
  .implement({
    fields: (t) => ({
      id: t.exposeID("id"),
      slug: t.exposeString("slug"),
      privacy: t.exposeString("privacy"),
    }),
  });

const MembershipType = builder.objectRef<GqlMembership>("Membership").implement({
  fields: (t) => ({
    id: t.exposeID("id"),
    roles: t.exposeStringList("roles"),
    timetable: t.field({ type: TimetableType, resolve: (m) => m.timetable }),
  }),
});

const MemberType = builder.objectRef<GqlMember>("Member").implement({
  fields: (t) => ({
    membershipId: t.exposeID("membershipId"),
    roles: t.exposeStringList("roles"),
    userId: t.id({ resolve: (m) => m.user.id }),
    name: t.string({ nullable: true, resolve: (m) => m.user.name }),
    email: t.string({ nullable: true, resolve: (m) => m.user.email }),
    image: t.string({ nullable: true, resolve: (m) => m.user.image }),
  }),
});

const WeightedHeartType = builder
  .objectRef<WeightedHeartEntry>("WeightedHeart")
  .implement({
    fields: (t) => ({
      electorId: t.exposeID("electorId"),
      electorName: t.exposeString("electorName", { nullable: true }),
      weight: t.exposeFloat("weight"),
    }),
  });

const CommentType = builder.objectRef<CommentNode>("Comment");
CommentType.implement({
  fields: (t) => ({
    id: t.exposeID("id"),
    parentId: t.exposeID("parentId", { nullable: true }),
    authorId: t.exposeID("authorId"),
    authorName: t.exposeString("authorName", { nullable: true }),
    authorImage: t.exposeString("authorImage", { nullable: true }),
    body: t.exposeString("body"),
    visibility: t.exposeString("visibility"),
    hidden: t.exposeBoolean("hidden"),
    createdAt: t.string({ resolve: (c) => c.createdAt.toISOString() }),
    replies: t.field({ type: [CommentType], resolve: (c) => c.replies }),
  }),
});

const TopicType = builder.objectRef<GqlTopic>("Topic").implement({
  fields: (t) => ({
    id: t.exposeID("id"),
    timetableId: t.exposeID("timetableId"),
    hostId: t.exposeID("hostId"),
    hostName: t.exposeString("hostName", { nullable: true }),
    hostImage: t.exposeString("hostImage", { nullable: true }),
    title: t.exposeString("title"),
    bodyMd: t.exposeString("bodyMd"),
    bodyHtml: t.string({ resolve: (tp) => renderMarkdown(tp.bodyMd) }),
    coverImageUrl: t.exposeString("coverImageUrl", { nullable: true }),
    status: t.exposeString("status"),
    heartCount: t.exposeInt("heartCount"),
    viewerHasHearted: t.exposeBoolean("viewerHasHearted"),
    commentCount: t.exposeInt("commentCount"),
    publishedAt: t.string({
      nullable: true,
      resolve: (tp) => tp.publishedAt?.toISOString() ?? null,
    }),
    createdAt: t.string({ resolve: (tp) => tp.createdAt.toISOString() }),
    // Weighted score is host/admin-only.
    weightedScore: t.float({
      nullable: true,
      resolve: (tp) => (tp.canSeeHostOnly ? tp.weightedScore : null),
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
      resolve: (tp) =>
        listCommentTree(tp.id, {
          includeHostOnly: tp.canSeeHostOnly,
          includeHidden: tp.canModerate,
        }),
    }),
  }),
});

const ManagedTopicType = builder.objectRef<Topic>("ManagedTopic").implement({
  fields: (t) => ({
    id: t.exposeID("id"),
    timetableId: t.exposeID("timetableId"),
    hostId: t.exposeID("hostId"),
    title: t.exposeString("title"),
    bodyMd: t.exposeString("bodyMd"),
    bodyHtml: t.string({ resolve: (tp) => renderMarkdown(tp.bodyMd) }),
    status: t.exposeString("status"),
    updatedAt: t.string({ resolve: (tp) => tp.updatedAt.toISOString() }),
    hostName: t.string({
      nullable: true,
      resolve: async (tp) => (await getUserById(tp.hostId))?.name ?? null,
    }),
    feedback: t.string({
      nullable: true,
      resolve: (tp) => getLatestHostOnlyComment(tp.id),
    }),
    coverImageUrl: t.exposeString("coverImageUrl", { nullable: true }),
  }),
});

const ActivityType = builder.objectRef<ActivityEntry>("ActivityEvent").implement({
  fields: (t) => ({
    id: t.exposeID("id"),
    action: t.exposeString("action"),
    note: t.exposeString("note", { nullable: true }),
    actorName: t.exposeString("actorName", { nullable: true }),
    createdAt: t.string({ resolve: (a) => a.createdAt.toISOString() }),
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

builder.queryType({
  fields: (t) => ({
    me: t.field({
      type: UserType,
      nullable: true,
      resolve: (_p, _a, ctx) => ctx.user,
    }),

    myTimetables: t.field({
      type: [MembershipType],
      resolve: async (_p, _a, ctx) => {
        if (!ctx.user) return [];
        // Claim any invites that arrived after the user's first sign-in.
        if (ctx.user.email) {
          await claimInvitesForUser(ctx.user.id, ctx.user.email);
        }
        const rows = await listMembershipsForUser(ctx.user.id);
        return rows.map((r) => ({
          id: r.membershipId,
          roles: r.roles as string[],
          timetable: { ...r.timetable, viewerRoles: r.roles as string[] },
        }));
      },
    }),

    timetable: t.field({
      type: TimetableType,
      nullable: true,
      args: { idOrSlug: t.arg.string({ required: true }) },
      resolve: async (_p, args, ctx) => {
        const result = await getReadableTimetable(
          ctx.user?.id ?? null,
          args.idOrSlug,
        );
        if (!result) return null;
        return { ...result.timetable, viewerRoles: result.roles as string[] };
      },
    }),

    myMembership: t.field({
      type: ["String"],
      args: { timetableId: t.arg.string({ required: true }) },
      resolve: async (_p, args, ctx) =>
        (await getViewerRoles(
          ctx.user?.id ?? null,
          args.timetableId,
        )) as string[],
    }),

    timetableMembers: t.field({
      type: [MemberType],
      args: { timetableId: t.arg.string({ required: true }) },
      resolve: async (_p, args, ctx) => {
        const viewer = await ctx.getViewer(args.timetableId);
        if (!canManageMembers(viewer)) return [];
        const members = await listMembers(args.timetableId);
        return members.map((m) => ({
          membershipId: m.membershipId,
          roles: m.roles as string[],
          user: m.user,
        }));
      },
    }),

    /** Published topic feed for a timetable (role-aware). */
    topicFeed: t.field({
      type: [TopicType],
      args: {
        idOrSlug: t.arg.string({ required: true }),
        hostId: t.arg.string({ required: false }),
        sort: t.arg.string({ required: false }),
        limit: t.arg.int({ required: false }),
        offset: t.arg.int({ required: false }),
      },
      resolve: async (_p, args, ctx) => {
        const readable = await getReadableTimetable(
          ctx.user?.id ?? null,
          args.idOrSlug,
        );
        if (!readable) return [];
        const viewer = { userId: ctx.user?.id ?? null, roles: readable.roles };
        const hostOnly = canSeeHostOnly(viewer);
        const moderate = canModerate(viewer);
        const sort = (args.sort ?? "hearts") as "hearts" | "comments" | "recent";
        const feed = await buildFeed(
          readable.timetable.id,
          ctx.user?.id ?? null,
          {
            hostId: args.hostId ?? undefined,
            sort,
            limit: args.limit ?? undefined,
            offset: args.offset ?? undefined,
          },
        );
        return feed.map((tp) => ({
          ...tp,
          canSeeHostOnly: hostOnly,
          canModerate: moderate,
        }));
      },
    }),

    /** The current user's own topics across all statuses. */
    hostDashboard: t.field({
      type: [ManagedTopicType],
      args: { idOrSlug: t.arg.string({ required: true }) },
      resolve: async (_p, args, ctx) => {
        if (!ctx.user) return [];
        const readable = await getReadableTimetable(ctx.user.id, args.idOrSlug);
        if (!readable) return [];
        return listHostTopics(readable.timetable.id, ctx.user.id);
      },
    }),

    /** Submitted topics awaiting moderation (admin only). */
    moderationQueue: t.field({
      type: [ManagedTopicType],
      args: { idOrSlug: t.arg.string({ required: true }) },
      resolve: async (_p, args, ctx) => {
        const readable = await getReadableTimetable(
          ctx.user?.id ?? null,
          args.idOrSlug,
        );
        if (!readable) return [];
        const viewer = { userId: ctx.user?.id ?? null, roles: readable.roles };
        if (!canModerate(viewer)) return [];
        return listSubmittedTopics(readable.timetable.id);
      },
    }),

    /** Activity timeline (admin only). */
    activityTimeline: t.field({
      type: [ActivityType],
      args: { idOrSlug: t.arg.string({ required: true }) },
      resolve: async (_p, args, ctx) => {
        const readable = await getReadableTimetable(
          ctx.user?.id ?? null,
          args.idOrSlug,
        );
        if (!readable) return [];
        const viewer = { userId: ctx.user?.id ?? null, roles: readable.roles };
        if (!canModerate(viewer)) return [];
        return listActivity(readable.timetable.id);
      },
    }),

    /** Hosts in a timetable (for the feed's host filter). */
    timetableHosts: t.field({
      type: [HostOptionType],
      args: { idOrSlug: t.arg.string({ required: true }) },
      resolve: async (_p, args, ctx) => {
        const readable = await getReadableTimetable(
          ctx.user?.id ?? null,
          args.idOrSlug,
        );
        if (!readable) return [];
        return listTimetableHosts(readable.timetable.id);
      },
    }),

    /** Public hostname routing lookup. Returns only route-safe fields. */
    timetableRouteByDomain: t.field({
      type: TimetableRouteType,
      nullable: true,
      args: { host: t.arg.string({ required: true }) },
      resolve: async (_p, args) => {
        const timetable = await getTimetableByDomain(args.host);
        if (!timetable) return null;
        return {
          id: timetable.id,
          slug: timetable.slug,
          privacy: timetable.privacy,
        };
      },
    }),
  }),
});

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

async function loadTopicAndViewer(ctx: ApiContext, topicId: string) {
  const topic = await getTopicById(topicId);
  if (!topic) notFound("Topic not found");
  const viewer = await ctx.getViewer(topic.timetableId);
  const timetable = await getTimetableById(topic.timetableId);
  if (timetable?.privacy === "deactivated" && !canModerate(viewer)) {
    forbidden("Timetable is deactivated");
  }
  return { topic, viewer };
}

builder.mutationType({
  fields: (t) => ({
    createTopic: t.field({
      type: ManagedTopicType,
      args: {
        idOrSlug: t.arg.string({ required: true }),
        title: t.arg.string({ required: true }),
        bodyMd: t.arg.string({ required: false }),
        coverImageUrl: t.arg.string({ required: false }),
      },
      resolve: async (_p, args, ctx) => {
        const user = await requireUser(ctx);
        const readable = await getReadableTimetable(user.id, args.idOrSlug);
        if (!readable) notFound("Timetable not found");
        const viewer = { userId: user.id, roles: readable.roles };
        if (!canProposeTopics(viewer)) forbidden("Hosts only");
        return createTopic(readable.timetable.id, user.id, {
          title: args.title,
          bodyMd: args.bodyMd ?? "",
          coverImageUrl:
            args.coverImageUrl != null ? args.coverImageUrl.trim() : undefined,
        });
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
        return updated;
      },
    }),

    submitTopic: t.field({
      type: ManagedTopicType,
      args: { topicId: t.arg.string({ required: true }) },
      resolve: async (_p, args, ctx) => {
        const user = await requireUser(ctx);
        const { topic, viewer } = await loadTopicAndViewer(ctx, args.topicId);
        const ownerHost = topic.hostId === user.id && isHost(viewer.roles);
        if (!(ownerHost || isAdmin(viewer.roles))) forbidden();
        if (topic.status !== "draft" && topic.status !== "unpublished") {
          throw new GraphQLError(
            "Only draft or unpublished topics can be submitted",
          );
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
        if (
          action !== "publish" &&
          action !== "reject" &&
          action !== "request_changes"
        ) {
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
        const visibility = args.visibility === "host_only" ? "host_only" : "public";
        if (visibility === "host_only") {
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
      resolve: async (_p, args, ctx) => {
        const user = await requireUser(ctx);
        const parent = await getCommentById(args.commentId);
        if (!parent) notFound("Comment not found");
        const { topic, viewer } = await loadTopicAndViewer(ctx, parent.topicId);
        if (parent.visibility === "host_only") {
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
        const updated = await setCommentHidden(
          parent.id,
          args.hidden,
          user.id,
        );
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

    /** Edit the current user's own profile (name, bio). */
    updateMyProfile: t.field({
      type: UserType,
      args: {
        name: t.arg.string({ required: false }),
        bio: t.arg.string({ required: false }),
        image: t.arg.string({ required: false }),
      },
      resolve: async (_p, args, ctx) => {
        const user = await requireUser(ctx);
        const updated = await updateUserProfile(user.id, {
          name: args.name ?? undefined,
          bio: args.bio ?? undefined,
          image: args.image != null ? args.image.trim() || null : undefined,
        });
        if (!updated) notFound("User not found");
        return {
          id: updated.id,
          email: updated.email,
          name: updated.name,
          image: updated.image,
          bio: updated.bio,
        };
      },
    }),

    /** Update the current user's digest preferences (no sends yet). */
    updateMyNotificationSettings: t.field({
      type: UserType,
      args: {
        digestNewTopics: t.arg.boolean({ required: false }),
        digestReplies: t.arg.boolean({ required: false }),
        digestActivity: t.arg.boolean({ required: false }),
      },
      resolve: async (_p, args, ctx) => {
        const user = await requireUser(ctx);
        const updated = await updateUserNotificationSettings(user.id, {
          ...(args.digestNewTopics != null
            ? { digestNewTopics: args.digestNewTopics }
            : {}),
          ...(args.digestReplies != null
            ? { digestReplies: args.digestReplies }
            : {}),
          ...(args.digestActivity != null
            ? { digestActivity: args.digestActivity }
            : {}),
        });
        if (!updated) notFound("User not found");
        return {
          id: updated.id,
          email: updated.email,
          name: updated.name,
          image: updated.image,
          bio: updated.bio,
        };
      },
    }),

    /** Admin: update timetable name, description, visibility, custom domain. */
    updateTimetableProfile: t.field({
      type: TimetableType,
      args: {
        idOrSlug: t.arg.string({ required: true }),
        name: t.arg.string({ required: false }),
        description: t.arg.string({ required: false }),
        privacy: t.arg.string({ required: false }),
        customDomain: t.arg.string({ required: false }),
      },
      resolve: async (_p, args, ctx) => {
        const user = await requireUser(ctx);
        const readable = await getReadableTimetable(user.id, args.idOrSlug);
        if (!readable) notFound("Timetable not found");
        const viewer = { userId: user.id, roles: readable.roles };
        if (!canEditSettings(viewer)) forbidden("Admins only");

        let privacy: "public" | "private" | "deactivated" | undefined;
        if (args.privacy != null) {
          if (
            args.privacy !== "public" &&
            args.privacy !== "private" &&
            args.privacy !== "deactivated"
          ) {
            throw new GraphQLError("Invalid privacy value");
          }
          privacy = args.privacy;
        }

        const updated = await updateTimetableProfile(readable.timetable.id, {
          name: args.name ?? undefined,
          description: args.description ?? undefined,
          privacy,
          customDomain:
            args.customDomain != null
              ? args.customDomain.trim()
              : undefined,
        });
        if (!updated) notFound("Timetable not found");
        return { ...updated, viewerRoles: readable.roles as string[] };
      },
    }),

    /** Admin: archive (reset) all hearts on a topic. */
    archiveTopicHearts: t.field({
      type: ManagedTopicType,
      args: { topicId: t.arg.string({ required: true }) },
      resolve: async (_p, args, ctx) => {
        const user = await requireUser(ctx);
        const { topic, viewer } = await loadTopicAndViewer(ctx, args.topicId);
        if (!canModerate(viewer)) forbidden("Admins only");
        await archiveTopicHearts(topic, user.id);
        return (await getTopicById(topic.id)) ?? topic;
      },
    }),

    /** Admin: update role labels and theme colors (persisted to settings). */
    updateTimetableSettings: t.field({
      type: TimetableType,
      args: {
        idOrSlug: t.arg.string({ required: true }),
        roleLabelAdmin: t.arg.string({ required: false }),
        roleLabelHost: t.arg.string({ required: false }),
        roleLabelElector: t.arg.string({ required: false }),
        themePrimary: t.arg.string({ required: false }),
        themeSecondary: t.arg.string({ required: false }),
        coverImageUrl: t.arg.string({ required: false }),
      },
      resolve: async (_p, args, ctx) => {
        const user = await requireUser(ctx);
        const readable = await getReadableTimetable(user.id, args.idOrSlug);
        if (!readable) notFound("Timetable not found");
        const viewer = { userId: user.id, roles: readable.roles };
        if (!canEditSettings(viewer)) forbidden("Admins only");

        const current = readable.timetable.settings;
        const patch: Partial<TimetableSettings> = {};

        if (
          args.roleLabelAdmin != null ||
          args.roleLabelHost != null ||
          args.roleLabelElector != null
        ) {
          patch.roleLabels = {
            ...(current.roleLabels ?? {}),
            ...(args.roleLabelAdmin != null
              ? { admin: args.roleLabelAdmin }
              : {}),
            ...(args.roleLabelHost != null
              ? { host: args.roleLabelHost }
              : {}),
            ...(args.roleLabelElector != null
              ? { elector: args.roleLabelElector }
              : {}),
          };
        }

        if (args.themePrimary != null || args.themeSecondary != null) {
          patch.theme = {
            ...(current.theme ?? {}),
            ...(args.themePrimary != null
              ? { primary: args.themePrimary }
              : {}),
            ...(args.themeSecondary != null
              ? { secondary: args.themeSecondary }
              : {}),
          };
        }

        if (args.coverImageUrl != null) {
          patch.coverImageUrl = args.coverImageUrl.trim() || null;
        }

        const updated = await updateTimetableSettings(
          readable.timetable.id,
          patch,
        );
        if (!updated) notFound("Timetable not found");
        return { ...updated, viewerRoles: readable.roles as string[] };
      },
    }),
  }),
});

// ---------------------------------------------------------------------------
// Phase 3 — Availability calendar
// ---------------------------------------------------------------------------

type GqlSlot = CalendarSlot & { canSeeHostOnly: boolean };

const SlotTagType = builder
  .objectRef<{ id: string; title: string }>("SlotTag")
  .implement({
    fields: (t) => ({
      id: t.exposeID("id"),
      title: t.exposeString("title"),
    }),
  });

const AvailabilityCountsType = builder
  .objectRef<{ green: number; yellow: number; red: number }>(
    "AvailabilityCounts",
  )
  .implement({
    fields: (t) => ({
      green: t.exposeInt("green"),
      yellow: t.exposeInt("yellow"),
      red: t.exposeInt("red"),
    }),
  });

const SlotAvailabilityType = builder
  .objectRef<{ userId: string; name: string | null; state: string }>(
    "SlotAvailability",
  )
  .implement({
    fields: (t) => ({
      userId: t.exposeID("userId"),
      name: t.exposeString("name", { nullable: true }),
      state: t.exposeString("state"),
    }),
  });

const TimeslotType = builder.objectRef<GqlSlot>("Timeslot").implement({
  fields: (t) => ({
    id: t.exposeID("id"),
    startsAt: t.string({ resolve: (s) => s.startsAt.toISOString() }),
    endsAt: t.string({ resolve: (s) => s.endsAt.toISOString() }),
    location: t.exposeString("location"),
    commentCount: t.exposeInt("commentCount"),
    viewerState: t.exposeString("viewerState", { nullable: true }),
    topics: t.field({ type: [SlotTagType], resolve: (s) => s.topics }),
    counts: t.field({ type: AvailabilityCountsType, resolve: (s) => s.counts }),
    // Per-elector availability is host/admin-only.
    perUser: t.field({
      type: [SlotAvailabilityType],
      nullable: true,
      resolve: (s) => (s.canSeeHostOnly ? s.perUser : null),
    }),
  }),
});

const SlotCommentType = builder
  .objectRef<{
    id: string;
    authorId: string;
    authorName: string | null;
    body: string;
    createdAt: Date;
  }>("SlotComment")
  .implement({
    fields: (t) => ({
      id: t.exposeID("id"),
      authorId: t.exposeID("authorId"),
      authorName: t.exposeString("authorName", { nullable: true }),
      body: t.exposeString("body"),
      createdAt: t.string({ resolve: (c) => c.createdAt.toISOString() }),
    }),
  });

async function loadSlotAndViewer(ctx: ApiContext, slotId: string) {
  const slot = await getSlotById(slotId);
  if (!slot) notFound("Timeslot not found");
  const viewer = await ctx.getViewer(slot.timetableId);
  const timetable = await getTimetableById(slot.timetableId);
  if (timetable?.privacy === "deactivated" && !canModerate(viewer)) {
    forbidden("Timetable is deactivated");
  }
  return { slot, viewer };
}

function parseAudience(
  raw: string | null | undefined,
  viewerUserId: string | null,
): Audience {
  if (raw === "hearted_mine" && viewerUserId) {
    return { kind: "hearted_mine", hostId: viewerUserId };
  }
  if (raw?.startsWith("hearted_topic:")) {
    return { kind: "hearted_topic", topicId: raw.slice("hearted_topic:".length) };
  }
  return { kind: "all" };
}

builder.queryFields((t) => ({
  /** The availability calendar for a timetable (role-aware). */
  calendar: t.field({
    type: [TimeslotType],
    args: {
      idOrSlug: t.arg.string({ required: true }),
      audience: t.arg.string({ required: false }),
    },
    resolve: async (_p, args, ctx) => {
      const readable = await getReadableTimetable(
        ctx.user?.id ?? null,
        args.idOrSlug,
      );
      if (!readable) return [];
      const viewer = { userId: ctx.user?.id ?? null, roles: readable.roles };
      const hostOnly = canSeeHostOnly(viewer);
      const audience = parseAudience(args.audience, ctx.user?.id ?? null);
      const audienceIds = await getAudienceElectorIds(
        readable.timetable.id,
        audience,
      );
      const slots = await buildCalendar(
        readable.timetable.id,
        audienceIds,
        ctx.user?.id ?? null,
      );
      return slots.map((s) => ({ ...s, canSeeHostOnly: hostOnly }));
    },
  }),

  /** Slot discussion thread (host/admin only). */
  slotComments: t.field({
    type: [SlotCommentType],
    args: { slotId: t.arg.string({ required: true }) },
    resolve: async (_p, args, ctx) => {
      const { viewer } = await loadSlotAndViewer(ctx, args.slotId);
      if (!canSeeHostOnly(viewer)) return [];
      return listSlotComments(args.slotId);
    },
  }),
}));

builder.mutationFields((t) => ({
  /** Admin: create a single timeslot. */
  createTimeslot: t.field({
    type: TimetableType,
    args: {
      idOrSlug: t.arg.string({ required: true }),
      startsAt: t.arg.string({ required: true }),
      endsAt: t.arg.string({ required: true }),
      location: t.arg.string({ required: false }),
    },
    resolve: async (_p, args, ctx) => {
      const user = await requireUser(ctx);
      const readable = await getReadableTimetable(user.id, args.idOrSlug);
      if (!readable) notFound("Timetable not found");
      if (!isAdmin(readable.roles)) forbidden("Admins only");
      await createSlots(readable.timetable.id, [
        {
          startsAt: new Date(args.startsAt),
          endsAt: new Date(args.endsAt),
          location: args.location ?? "",
        },
      ]);
      return { ...readable.timetable, viewerRoles: readable.roles as string[] };
    },
  }),

  /** Admin: create N weekly-repeating timeslots from a starting slot. */
  createWeeklyTimeslots: t.field({
    type: TimetableType,
    args: {
      idOrSlug: t.arg.string({ required: true }),
      startsAt: t.arg.string({ required: true }),
      endsAt: t.arg.string({ required: true }),
      location: t.arg.string({ required: false }),
      count: t.arg.int({ required: true }),
    },
    resolve: async (_p, args, ctx) => {
      const user = await requireUser(ctx);
      const readable = await getReadableTimetable(user.id, args.idOrSlug);
      if (!readable) notFound("Timetable not found");
      if (!isAdmin(readable.roles)) forbidden("Admins only");
      const start = new Date(args.startsAt);
      const end = new Date(args.endsAt);
      const week = 7 * 24 * 60 * 60 * 1000;
      const n = Math.max(1, Math.min(args.count, 52));
      const inputs = Array.from({ length: n }, (_v, i) => ({
        startsAt: new Date(start.getTime() + i * week),
        endsAt: new Date(end.getTime() + i * week),
        location: args.location ?? "",
      }));
      await createSlots(readable.timetable.id, inputs);
      return { ...readable.timetable, viewerRoles: readable.roles as string[] };
    },
  }),

  /** Admin: update a timeslot. */
  updateTimeslot: t.field({
    type: TimetableType,
    args: {
      slotId: t.arg.string({ required: true }),
      startsAt: t.arg.string({ required: false }),
      endsAt: t.arg.string({ required: false }),
      location: t.arg.string({ required: false }),
    },
    resolve: async (_p, args, ctx) => {
      const { slot, viewer } = await loadSlotAndViewer(ctx, args.slotId);
      if (!isAdmin(viewer.roles)) forbidden("Admins only");
      await updateSlot(slot.id, {
        startsAt: args.startsAt ? new Date(args.startsAt) : undefined,
        endsAt: args.endsAt ? new Date(args.endsAt) : undefined,
        location: args.location ?? undefined,
      });
      const readable = await getReadableTimetable(
        ctx.user?.id ?? null,
        slot.timetableId,
      );
      if (!readable) notFound("Timetable not found");
      return { ...readable.timetable, viewerRoles: readable.roles as string[] };
    },
  }),

  /** Admin: delete a timeslot. */
  deleteTimeslot: t.field({
    type: "Boolean",
    args: { slotId: t.arg.string({ required: true }) },
    resolve: async (_p, args, ctx) => {
      const { slot, viewer } = await loadSlotAndViewer(ctx, args.slotId);
      if (!isAdmin(viewer.roles)) forbidden("Admins only");
      await deleteSlot(slot.id);
      return true;
    },
  }),

  /** Elector: set availability for one slot. */
  setAvailability: t.field({
    type: "Boolean",
    args: {
      slotId: t.arg.string({ required: true }),
      state: t.arg.string({ required: true }),
    },
    resolve: async (_p, args, ctx) => {
      const user = await requireUser(ctx);
      const { slot, viewer } = await loadSlotAndViewer(ctx, args.slotId);
      if (!isElector(viewer.roles)) forbidden("Electors only");
      const state = args.state as AvailabilityState;
      if (state !== "green" && state !== "yellow" && state !== "red") {
        throw new GraphQLError("Invalid availability state");
      }
      await setAvailability(slot.id, user.id, state);
      return true;
    },
  }),

  /** Elector: set availability for every slot on a weekday (0=Sun..6=Sat). */
  setWeekdayAvailability: t.field({
    type: "Int",
    args: {
      idOrSlug: t.arg.string({ required: true }),
      weekday: t.arg.int({ required: true }),
      state: t.arg.string({ required: true }),
    },
    resolve: async (_p, args, ctx) => {
      const user = await requireUser(ctx);
      const readable = await getReadableTimetable(user.id, args.idOrSlug);
      if (!readable) notFound("Timetable not found");
      if (!isElector(readable.roles)) forbidden("Electors only");
      const state = args.state as AvailabilityState;
      if (state !== "green" && state !== "yellow" && state !== "red") {
        throw new GraphQLError("Invalid availability state");
      }
      return setWeekdayAvailability(
        readable.timetable.id,
        user.id,
        args.weekday,
        state,
      );
    },
  }),

  /** Host/admin: post to a slot discussion. */
  addSlotComment: t.field({
    type: SlotCommentType,
    args: {
      slotId: t.arg.string({ required: true }),
      body: t.arg.string({ required: true }),
    },
    resolve: async (_p, args, ctx) => {
      const user = await requireUser(ctx);
      const { slot, viewer } = await loadSlotAndViewer(ctx, args.slotId);
      if (!canSeeHostOnly(viewer)) forbidden("Hosts/admins only");
      const body = args.body.trim();
      if (!body) throw new GraphQLError("Comment cannot be empty");
      const comment = await addSlotComment(slot.id, user.id, body);
      const author = await getUserById(user.id);
      return {
        id: comment.id,
        authorId: comment.authorId,
        authorName: author?.name ?? null,
        body: comment.body,
        createdAt: comment.createdAt,
      };
    },
  }),

  /** Admin: tag a slot with a topic. */
  tagSlotTopic: t.field({
    type: "Boolean",
    args: {
      slotId: t.arg.string({ required: true }),
      topicId: t.arg.string({ required: true }),
    },
    resolve: async (_p, args, ctx) => {
      const { slot, viewer } = await loadSlotAndViewer(ctx, args.slotId);
      if (!isAdmin(viewer.roles)) forbidden("Admins only");
      await tagSlotTopic(slot.id, args.topicId);
      return true;
    },
  }),

  /** Admin: remove a topic tag from a slot. */
  untagSlotTopic: t.field({
    type: "Boolean",
    args: {
      slotId: t.arg.string({ required: true }),
      topicId: t.arg.string({ required: true }),
    },
    resolve: async (_p, args, ctx) => {
      const { slot, viewer } = await loadSlotAndViewer(ctx, args.slotId);
      if (!isAdmin(viewer.roles)) forbidden("Admins only");
      await untagSlotTopic(slot.id, args.topicId);
      return true;
    },
  }),
}));

// ---------------------------------------------------------------------------
// Phase 4 — dashboard analytics, ICS token, custom-domain lookup
// ---------------------------------------------------------------------------

const TopicCountsType = builder
  .objectRef<DashboardData["topicCounts"]>("TopicCounts")
  .implement({
    fields: (t) => ({
      draft: t.exposeInt("draft"),
      submitted: t.exposeInt("submitted"),
      published: t.exposeInt("published"),
      unpublished: t.exposeInt("unpublished"),
      archived: t.exposeInt("archived"),
    }),
  });

const TopicLeaderboardEntryType = builder
  .objectRef<DashboardData["topicLeaderboard"][number]>("TopicLeaderboardEntry")
  .implement({
    fields: (t) => ({
      id: t.exposeID("id"),
      title: t.exposeString("title"),
      hostName: t.exposeString("hostName", { nullable: true }),
      weightedScore: t.exposeFloat("weightedScore"),
      heartCount: t.exposeInt("heartCount"),
    }),
  });

const HostLeaderboardEntryType = builder
  .objectRef<DashboardData["hostLeaderboard"][number]>("HostLeaderboardEntry")
  .implement({
    fields: (t) => ({
      hostId: t.exposeID("hostId"),
      hostName: t.exposeString("hostName", { nullable: true }),
      weightedScore: t.exposeFloat("weightedScore"),
    }),
  });

const UnallocatedTopicType = builder
  .objectRef<DashboardData["unallocatedTopics"][number]>("UnallocatedTopic")
  .implement({
    fields: (t) => ({
      id: t.exposeID("id"),
      title: t.exposeString("title"),
    }),
  });

const ConflictSlotType = builder
  .objectRef<DashboardData["conflicts"][number]>("ConflictSlot")
  .implement({
    fields: (t) => ({
      slotId: t.exposeID("slotId"),
      location: t.exposeString("location"),
      startsAt: t.string({ resolve: (c) => c.startsAt.toISOString() }),
      topics: t.field({ type: [SlotTagType], resolve: (c) => c.topics }),
    }),
  });

const DashboardType = builder
  .objectRef<DashboardData>("Dashboard")
  .implement({
    fields: (t) => ({
      totalHearts: t.exposeInt("totalHearts"),
      electorCount: t.exposeInt("electorCount"),
      hostCount: t.exposeInt("hostCount"),
      slotCount: t.exposeInt("slotCount"),
      topicCounts: t.field({
        type: TopicCountsType,
        resolve: (d) => d.topicCounts,
      }),
      topicLeaderboard: t.field({
        type: [TopicLeaderboardEntryType],
        resolve: (d) => d.topicLeaderboard,
      }),
      hostLeaderboard: t.field({
        type: [HostLeaderboardEntryType],
        resolve: (d) => d.hostLeaderboard,
      }),
      unallocatedTopics: t.field({
        type: [UnallocatedTopicType],
        resolve: (d) => d.unallocatedTopics,
      }),
      conflicts: t.field({
        type: [ConflictSlotType],
        resolve: (d) => d.conflicts,
      }),
    }),
  });

builder.queryFields((t) => ({
  /** Dashboard analytics for a timetable (host/admin only). */
  dashboard: t.field({
    type: DashboardType,
    nullable: true,
    args: { idOrSlug: t.arg.string({ required: true }) },
    resolve: async (_p, args, ctx) => {
      const readable = await getReadableTimetable(
        ctx.user?.id ?? null,
        args.idOrSlug,
      );
      if (!readable) return null;
      const viewer = { userId: ctx.user?.id ?? null, roles: readable.roles };
      if (!canSeeHostOnly(viewer)) return null;
      return getDashboard(readable.timetable.id);
    },
  }),

  /** The current user's ICS subscription token (created on first use). */
  myIcsToken: t.field({
    type: "String",
    nullable: true,
    resolve: async (_p, _a, ctx) => {
      const user = await requireUser(ctx);
      return getOrCreateIcsToken(user.id);
    },
  }),

  /** Resolve a timetable by custom domain (for hostname routing). */
  timetableByDomain: t.field({
    type: TimetableType,
    nullable: true,
    args: { host: t.arg.string({ required: true }) },
    resolve: async (_p, args, ctx) => {
      const timetable = await getTimetableByDomain(args.host);
      if (!timetable) return null;
      const readable = await getReadableTimetable(
        ctx.user?.id ?? null,
        timetable.id,
      );
      if (!readable) return null;
      return { ...readable.timetable, viewerRoles: readable.roles as string[] };
    },
  }),
}));

export const schema = builder.toSchema();
