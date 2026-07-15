import SchemaBuilder from "@pothos/core";
import { GraphQLError } from "graphql";

import {
  addComment,
  addReply,
  addSlotComment,
  buildCalendar,
  buildFeed,
  type FeedSort,
  claimInvitesForUser,
  countViewerPublishedHearts,
  createSlots,
  createTopic,
  deleteSlot,
  getAudienceElectorIds,
  getCommentById,
  getDashboard,
  getOrCreateIcsToken,
  getReadableTimetable,
  getSlotById,
  getTimetableById,
  getFeedLastSeen,
  getLastVisitedTimetableSlug,
  getOrCreateUserSlug,
  getPerson,
  listPeople,
  getTimetableByDomain,
  getTopicById,
  getTopicBySlug,
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
  listDraftTopics,
  listSubmittedTopics,
  listTimetableHosts,
  logActivity,
  countUnreadNotifications,
  listNotifications,
  markFeedSeen,
  markNotificationsSeen,
  moderateTopic,
  reassignTopic,
  setAvailability,
  setCommentHidden,
  setHeartsCountFrom,
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
  type ElectorActivityFilter,
  type FeedTopic,
  type Person,
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
  canSeeComments,
  canSeeHostOnly,
  canSeePersonProfile,
  isAdmin,
  isElector,
  isHost,
  PRIVACY_LEVELS,
  type Privacy,
  type Role as SharedRole,
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
type GqlTopic = FeedTopic & {
  canSeeHostOnly: boolean;
  canModerate: boolean;
  canSeeComments: boolean;
};

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

function badRequest(message = "Bad request"): never {
  throw new GraphQLError(message, { extensions: { code: "BAD_REQUEST" } });
}

const THEME_FONTS = new Set([
  "default",
  "editorial",
  "humanist",
  "modern",
  "technical",
]);
const HEX_COLOUR = /^#[0-9a-fA-F]{6}$/;

/** A validated #rrggbb hex, or undefined. Shared by the themeJson parser and
 * the legacy themePrimary/themeSecondary args so no unvalidated colour is ever
 * stored (and later injected into the SSR theme <style> tag). */
const colour = (v: unknown): string | undefined =>
  typeof v === "string" && HEX_COLOUR.test(v) ? v : undefined;

/** Validate a client-sent theme (QA #59): known keys only, colours must be
 * #rrggbb, font from the curated list. Returns null when invalid. */
function parseThemeJson(
  raw: string,
): NonNullable<TimetableSettings["theme"]> | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const source = parsed as Record<string, unknown>;

  const theme: NonNullable<TimetableSettings["theme"]> = {};
  theme.primary = colour(source.primary);
  theme.secondary = colour(source.secondary);
  theme.background = colour(source.background);
  theme.topbar = colour(source.topbar);
  theme.topbarText = colour(source.topbarText);
  theme.text = colour(source.text);
  if (typeof source.font === "string" && THEME_FONTS.has(source.font)) {
    theme.font = source.font;
  }
  if (typeof source.dark === "object" && source.dark !== null) {
    const d = source.dark as Record<string, unknown>;
    theme.dark = {
      primary: colour(d.primary),
      secondary: colour(d.secondary),
      background: colour(d.background),
      topbar: colour(d.topbar),
      topbarText: colour(d.topbarText),
      text: colour(d.text),
    };
  }
  return theme;
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
    heartsCountFrom: t.string({
      nullable: true,
      resolve: (tt) => tt.heartsCountFrom?.toISOString() ?? null,
    }),
    viewerRoles: t.exposeStringList("viewerRoles"),
    settings: t.field({
      type: "String",
      resolve: (tt) => JSON.stringify(tt.settings ?? {}),
    }),
    /**
     * Published topics the signed-in viewer currently hearts — their vote
     * weight is 1/count. Null for anonymous viewers. Viewer-scoped, so safe
     * for any member (unlike the host-only weighted breakdowns).
     */
    viewerHeartedPublishedCount: t.int({
      nullable: true,
      resolve: (tt, _args, ctx) =>
        ctx.user ? countViewerPublishedHearts(tt.id, ctx.user.id) : null,
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

const PersonTopicType = builder
  .objectRef<{ id: string; title: string; slug: string | null }>("PersonTopic")
  .implement({
    fields: (t) => ({
      id: t.exposeID("id"),
      title: t.exposeString("title"),
      slug: t.exposeString("slug", { nullable: true }),
    }),
  });

const PersonType = builder.objectRef<Person>("Person").implement({
  fields: (t) => ({
    userId: t.exposeID("userId"),
    name: t.exposeString("name", { nullable: true }),
    image: t.exposeString("image", { nullable: true }),
    slug: t.exposeString("slug", { nullable: true }),
    roles: t.exposeStringList("roles"),
    /** Markdown bios (QA #42), rendered with the shared pipeline. */
    bioHtml: t.string({
      nullable: true,
      resolve: (p) => (p.bio ? renderMarkdown(p.bio) : null),
    }),
    bio: t.exposeString("bio", { nullable: true }),
    /** Published topics this person hosts (QA #59 — People page cards). */
    publishedTopics: t.field({
      type: [PersonTopicType],
      resolve: (p) => p.publishedTopics ?? [],
    }),
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
        return listCommentTree(tp.id, {
          includeHostOnly: tp.canSeeHostOnly,
          includeHidden: tp.canModerate,
        });
      },
    }),
  }),
});

const ManagedTopicType = builder.objectRef<Topic>("ManagedTopic").implement({
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

const ActivityType = builder.objectRef<ActivityEntry>("ActivityEvent").implement({
  fields: (t) => ({
    id: t.exposeID("id"),
    action: t.exposeString("action"),
    note: t.exposeString("note", { nullable: true }),
    actorId: t.exposeString("actorId", { nullable: true }),
    actorName: t.exposeString("actorName", { nullable: true }),
    actorImage: t.exposeString("actorImage", { nullable: true }),
    actorRoles: t.exposeStringList("actorRoles"),
    createdAt: t.string({ resolve: (a) => a.createdAt.toISOString() }),
    // Enrichment (QA #42): which topic the event refers to, and what was
    // said/done — all sourced from the event payload + a slug join.
    topicTitle: t.string({
      nullable: true,
      resolve: (a) => (a.payload["title"] as string | undefined) ?? null,
    }),
    topicSlug: t.exposeString("topicSlug", { nullable: true }),
    topicHostSlug: t.exposeString("topicHostSlug", { nullable: true }),
    topicHostName: t.exposeString("topicHostName", { nullable: true }),
    snippet: t.string({
      nullable: true,
      resolve: (a) => (a.payload["snippet"] as string | undefined) ?? null,
    }),
    /** For comment events: anchors the timeline link to the comment. */
    commentId: t.string({
      nullable: true,
      resolve: (a) => (a.payload["commentId"] as string | undefined) ?? null,
    }),
    /** For member.invite events (QA #59). */
    invitedEmail: t.string({
      nullable: true,
      resolve: (a) => (a.payload["invitedEmail"] as string | undefined) ?? null,
    }),
    invitedRoles: t.stringList({
      resolve: (a) => (a.payload["invitedRoles"] as string[] | undefined) ?? [],
    }),
  }),
});

const NotificationType = builder
  .objectRef<import("@timetable/core").NotificationItem>("Notification")
  .implement({
    fields: (t) => ({
      commentId: t.exposeID("commentId"),
      kind: t.exposeString("kind"),
      authorId: t.exposeID("authorId"),
      authorName: t.exposeString("authorName", { nullable: true }),
      body: t.exposeString("body"),
      visibility: t.exposeString("visibility"),
      createdAt: t.string({ resolve: (n) => n.createdAt.toISOString() }),
      topicId: t.exposeID("topicId"),
      topicTitle: t.exposeString("topicTitle"),
      topicSlug: t.exposeString("topicSlug", { nullable: true }),
      topicHostSlug: t.exposeString("topicHostSlug", { nullable: true }),
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

    /** Members with public profile fields (People page). Anyone who can
     * read the timetable can see it — bios follow timetable visibility. */
    timetablePeople: t.field({
      type: [PersonType],
      args: { idOrSlug: t.arg.string({ required: true }) },
      resolve: async (_p, args, ctx) => {
        const readable = await getReadableTimetable(
          ctx.user?.id ?? null,
          args.idOrSlug,
        );
        if (!readable) return [];
        const viewer = { userId: ctx.user?.id ?? null, roles: readable.roles };
        const people = await listPeople(readable.timetable.id);
        return people.filter((p) =>
          canSeePersonProfile(
            readable.timetable.privacy as Privacy,
            viewer,
            p.roles as SharedRole[],
          ),
        );
      },
    }),

    /** One member's public profile — powers the bio modal. */
    person: t.field({
      type: PersonType,
      nullable: true,
      args: {
        idOrSlug: t.arg.string({ required: true }),
        userId: t.arg.string({ required: true }),
      },
      resolve: async (_p, args, ctx) => {
        const readable = await getReadableTimetable(
          ctx.user?.id ?? null,
          args.idOrSlug,
        );
        if (!readable) return null;
        const viewer = { userId: ctx.user?.id ?? null, roles: readable.roles };
        const person = await getPerson(readable.timetable.id, args.userId);
        if (
          person &&
          !canSeePersonProfile(
            readable.timetable.privacy as Privacy,
            viewer,
            person.roles as SharedRole[],
          )
        ) {
          return null;
        }
        return person;
      },
    }),

    /** Slug of the timetable the viewer last engaged with (for the
     * signed-in landing redirect and brand link). */
    myLastVisitedTimetableSlug: t.string({
      nullable: true,
      resolve: async (_p, _args, ctx) =>
        ctx.user ? getLastVisitedTimetableSlug(ctx.user.id) : null,
    }),

    /** The viewer's feed watermark for the "new since last visit"
     * highlight; null for anonymous visitors and first-time viewers. */
    myFeedLastSeenAt: t.string({
      nullable: true,
      args: { idOrSlug: t.arg.string({ required: true }) },
      resolve: async (_p, args, ctx) => {
        if (!ctx.user) return null;
        const readable = await getReadableTimetable(ctx.user.id, args.idOrSlug);
        if (!readable) return null;
        const seen = await getFeedLastSeen(ctx.user.id, readable.timetable.id);
        return seen ? seen.toISOString() : null;
      },
    }),

    /** Comments on the viewer's topics + replies to their comments
     * (QA #59 notifications pane). Members only. */
    notifications: t.field({
      type: [NotificationType],
      args: { idOrSlug: t.arg.string({ required: true }) },
      resolve: async (_p, args, ctx) => {
        if (!ctx.user) return [];
        const readable = await getReadableTimetable(ctx.user.id, args.idOrSlug);
        if (!readable || readable.roles.length === 0) return [];
        return listNotifications(readable.timetable.id, ctx.user.id);
      },
    }),

    /** Unread-notification count for the sidebar badge. */
    notificationsUnread: t.int({
      args: { idOrSlug: t.arg.string({ required: true }) },
      resolve: async (_p, args, ctx) => {
        if (!ctx.user) return 0;
        const readable = await getReadableTimetable(ctx.user.id, args.idOrSlug);
        if (!readable || readable.roles.length === 0) return 0;
        return countUnreadNotifications(readable.timetable.id, ctx.user.id);
      },
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
        heartedByMe: t.arg.boolean({ required: false }),
        sort: t.arg.string({ required: false }),
        seed: t.arg.string({ required: false }),
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
        return feed.map((tp) => ({
          ...tp,
          canSeeHostOnly: hostOnly,
          canModerate: moderate,
          canSeeComments: seeComments,
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

    /** Every host's drafts, read-only (admin only, QA #59 — forgotten
     * drafts stay visible on Pending Topics). */
    draftTopics: t.field({
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
        return listDraftTopics(readable.timetable.id);
      },
    }),

    /** Activity timeline (admin only). */
    activityTimeline: t.field({
      type: [ActivityType],
      args: {
        idOrSlug: t.arg.string({ required: true }),
        actorId: t.arg.string({ required: false }),
        from: t.arg.string({ required: false }),
        to: t.arg.string({ required: false }),
      },
      resolve: async (_p, args, ctx) => {
        const readable = await getReadableTimetable(
          ctx.user?.id ?? null,
          args.idOrSlug,
        );
        if (!readable) return [];
        const viewer = { userId: ctx.user?.id ?? null, roles: readable.roles };
        if (!canModerate(viewer)) return [];
        const parseDay = (value: string | null | undefined, endOfDay: boolean) => {
          if (!value) return undefined;
          const parsed = Date.parse(value);
          if (Number.isNaN(parsed)) return undefined;
          const date = new Date(parsed);
          if (endOfDay) date.setUTCHours(23, 59, 59, 999);
          return date;
        };
        return listActivity(readable.timetable.id, {
          actorId: args.actorId ?? undefined,
          from: parseDay(args.from, false),
          to: parseDay(args.to, true),
        });
      },
    }),

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
      resolve: async (_p, args, ctx) => {
        const readable = await getReadableTimetable(
          ctx.user?.id ?? null,
          args.idOrSlug,
        );
        if (!readable) return null;
        const topic = await getTopicBySlug(
          readable.timetable.id,
          args.topicSlug,
        );
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
    /** Bumps the viewer's feed watermark to now (no-op for non-members). */
    markFeedSeen: t.boolean({
      args: { idOrSlug: t.arg.string({ required: true }) },
      resolve: async (_p, args, ctx) => {
        const user = await requireUser(ctx);
        const readable = await getReadableTimetable(user.id, args.idOrSlug);
        if (!readable) notFound("Timetable not found");
        await markFeedSeen(user.id, readable.timetable.id);
        return true;
      },
    }),

    /** Audit trail for the view-as-user preview (QA #59 round 3): called
     * as the admin enters the preview, before the cookie applies. The
     * preview itself is enforced per-request from the x-view-as header. */
    startUserPreview: t.boolean({
      args: {
        idOrSlug: t.arg.string({ required: true }),
        userId: t.arg.string({ required: true }),
      },
      resolve: async (_p, args, ctx) => {
        const user = await requireUser(ctx);
        const readable = await getReadableTimetable(user.id, args.idOrSlug);
        if (!readable) notFound("Timetable not found");
        const viewer = { userId: user.id, roles: readable.roles };
        if (!canModerate(viewer)) forbidden("Admins only");
        const target = await getPerson(readable.timetable.id, args.userId);
        if (!target) notFound("Member not found");
        await logActivity({
          timetableId: readable.timetable.id,
          actorId: user.id,
          action: "member.impersonate",
          payload: { targetUserId: target.userId, targetName: target.name },
        });
        return true;
      },
    }),

    /** Companion audit entry when the preview ends (cookie already
     * cleared, so this runs as the real admin again). */
    stopUserPreview: t.boolean({
      args: {
        idOrSlug: t.arg.string({ required: true }),
        userId: t.arg.string({ required: true }),
      },
      resolve: async (_p, args, ctx) => {
        const user = await requireUser(ctx);
        const readable = await getReadableTimetable(user.id, args.idOrSlug);
        if (!readable) notFound("Timetable not found");
        const viewer = { userId: user.id, roles: readable.roles };
        if (!canModerate(viewer)) forbidden("Admins only");
        await logActivity({
          timetableId: readable.timetable.id,
          actorId: user.id,
          action: "member.impersonate_end",
          payload: { targetUserId: args.userId },
        });
        return true;
      },
    }),

    /** Resets the notifications badge (QA #59). */
    markNotificationsSeen: t.boolean({
      args: { idOrSlug: t.arg.string({ required: true }) },
      resolve: async (_p, args, ctx) => {
        const user = await requireUser(ctx);
        const readable = await getReadableTimetable(user.id, args.idOrSlug);
        if (!readable) notFound("Timetable not found");
        await markNotificationsSeen(readable.timetable.id, user.id);
        return true;
      },
    }),

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
        const targetRoles = await getViewerRoles(
          args.hostId,
          topic.timetableId,
        );
        if (!(isHost(targetRoles) || isAdmin(targetRoles))) {
          throw new GraphQLError(
            "New owner must hold the host or admin role in this timetable",
          );
        }
        const updated = await reassignTopic(topic, args.hostId, user.id);
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

        let privacy: Privacy | undefined;
        if (args.privacy != null) {
          if (!(PRIVACY_LEVELS as readonly string[]).includes(args.privacy)) {
            throw new GraphQLError("Invalid privacy value");
          }
          privacy = args.privacy as Privacy;
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

    /** Admin: edit any member's bio (QA #42 — bios are editable from the
     * Members section in Settings). Logged to the activity feed. */
    updateMemberBio: t.field({
      type: PersonType,
      nullable: true,
      args: {
        idOrSlug: t.arg.string({ required: true }),
        userId: t.arg.string({ required: true }),
        bio: t.arg.string({ required: true }),
      },
      resolve: async (_p, args, ctx) => {
        const user = await requireUser(ctx);
        const readable = await getReadableTimetable(user.id, args.idOrSlug);
        if (!readable) notFound("Timetable not found");
        const viewer = { userId: user.id, roles: readable.roles };
        if (!canManageMembers(viewer)) forbidden("Admins only");
        const target = await getPerson(readable.timetable.id, args.userId);
        if (!target) notFound("Member not found");
        await updateUserProfile(args.userId, { bio: args.bio.trim() || null });
        await logActivity({
          timetableId: readable.timetable.id,
          actorId: user.id,
          action: "member.bio_edit",
          payload: { userId: args.userId, name: target.name },
        });
        return getPerson(readable.timetable.id, args.userId);
      },
    }),

    /** Admin: set (or clear, with null) the timetable's heart-count cutoff —
     * hearts created before it stop counting everywhere. Replaces the old
     * per-topic "archive hearts" reset (QA #42). */
    setHeartsCountFrom: t.field({
      type: TimetableType,
      args: {
        idOrSlug: t.arg.string({ required: true }),
        countFrom: t.arg.string({ required: false }),
      },
      resolve: async (_p, args, ctx) => {
        const user = await requireUser(ctx);
        const readable = await getReadableTimetable(user.id, args.idOrSlug);
        if (!readable) notFound("Timetable not found");
        const viewer = { userId: user.id, roles: readable.roles };
        if (!canModerate(viewer)) forbidden("Admins only");
        let countFrom: Date | null = null;
        if (args.countFrom) {
          countFrom = new Date(args.countFrom);
          if (Number.isNaN(countFrom.getTime())) {
            throw new GraphQLError("countFrom must be an ISO date-time");
          }
        }
        await setHeartsCountFrom(readable.timetable.id, countFrom, user.id);
        const updated = await getReadableTimetable(user.id, args.idOrSlug);
        if (!updated) notFound("Timetable not found");
        return {
          ...updated.timetable,
          viewerRoles: updated.roles as string[],
        };
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
        /** Full theme object (QA #59) — JSON, validated server-side.
         * Wins over the individual theme args when both are sent. */
        themeJson: t.arg.string({ required: false }),
        coverImageUrl: t.arg.string({ required: false }),
        iconUrl: t.arg.string({ required: false }),
        iconEmoji: t.arg.string({ required: false }),
        digestNewTopics: t.arg.boolean({ required: false }),
        digestReplies: t.arg.boolean({ required: false }),
        digestActivity: t.arg.boolean({ required: false }),
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

        // Legacy individual theme args — validate through the same HEX_COLOUR
        // gate the themeJson path uses so an invalid string can't be persisted
        // and later injected into the SSR theme <style> tag. Invalid/absent
        // values are dropped (mirrors colour() in parseThemeJson).
        const themePrimary = colour(args.themePrimary);
        const themeSecondary = colour(args.themeSecondary);
        if (themePrimary != null || themeSecondary != null) {
          patch.theme = {
            ...(current.theme ?? {}),
            ...(themePrimary != null ? { primary: themePrimary } : {}),
            ...(themeSecondary != null ? { secondary: themeSecondary } : {}),
          };
        }

        if (args.themeJson != null) {
          const parsed = parseThemeJson(args.themeJson);
          if (!parsed) badRequest("Invalid theme");
          patch.theme = parsed;
        }

        if (args.coverImageUrl != null) {
          patch.coverImageUrl = args.coverImageUrl.trim() || null;
        }

        if (args.iconUrl != null) {
          patch.iconUrl = args.iconUrl.trim() || null;
        }

        // A short emoji sequence (capped to guard against arbitrary payloads).
        if (args.iconEmoji != null) {
          patch.iconEmoji = args.iconEmoji.trim().slice(0, 24) || null;
        }

        if (
          args.digestNewTopics != null ||
          args.digestReplies != null ||
          args.digestActivity != null
        ) {
          patch.digestDefaults = {
            ...(current.digestDefaults ?? {}),
            ...(args.digestNewTopics != null
              ? { digestNewTopics: args.digestNewTopics }
              : {}),
            ...(args.digestReplies != null
              ? { digestReplies: args.digestReplies }
              : {}),
            ...(args.digestActivity != null
              ? { digestActivity: args.digestActivity }
              : {}),
          };
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
      slug: t.exposeString("slug", { nullable: true }),
      hostName: t.exposeString("hostName", { nullable: true }),
      hostSlug: t.exposeString("hostSlug", { nullable: true }),
      weightedScore: t.exposeFloat("weightedScore"),
      l2Score: t.exposeFloat("l2Score"),
      devotionScore: t.exposeFloat("devotionScore"),
      heartCount: t.exposeInt("heartCount"),
      lastHeartAt: t.string({
        nullable: true,
        resolve: (e) => e.lastHeartAt?.toISOString() ?? null,
      }),
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
      slug: t.exposeString("slug", { nullable: true }),
      hostSlug: t.exposeString("hostSlug", { nullable: true }),
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

const ElectorHeartedTopicType = builder
  .objectRef<
    DashboardData["electorActivity"][number]["heartedTopics"][number]
  >("ElectorHeartedTopic")
  .implement({
    fields: (t) => ({
      topicId: t.exposeID("topicId"),
      title: t.exposeString("title"),
      slug: t.exposeString("slug", { nullable: true }),
      hostId: t.exposeID("hostId"),
      hostName: t.exposeString("hostName", { nullable: true }),
      hostSlug: t.exposeString("hostSlug", { nullable: true }),
    }),
  });

const ElectorActivityType = builder
  .objectRef<DashboardData["electorActivity"][number]>("ElectorActivity")
  .implement({
    fields: (t) => ({
      electorId: t.exposeID("electorId"),
      electorName: t.exposeString("electorName", { nullable: true }),
      heartCount: t.exposeInt("heartCount"),
      commentCount: t.exposeInt("commentCount"),
      availabilityCount: t.exposeInt("availabilityCount"),
      latestActivityAt: t.string({
        nullable: true,
        resolve: (activity) => activity.latestActivityAt?.toISOString() ?? null,
      }),
      heartedTopics: t.field({
        type: [ElectorHeartedTopicType],
        resolve: (activity) => activity.heartedTopics,
      }),
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
      electorActivity: t.field({
        type: [ElectorActivityType],
        resolve: (d) => d.electorActivity,
      }),
    }),
  });

function parseElectorActivityFilter(
  raw: string | null | undefined,
): ElectorActivityFilter {
  if (
    raw === "active" ||
    raw === "quiet" ||
    raw === "no_hearts" ||
    raw === "no_comments" ||
    raw === "no_availability"
  ) {
    return raw;
  }
  return "all";
}

builder.queryFields((t) => ({
  /** Dashboard analytics for a timetable (host/admin only). */
  dashboard: t.field({
    type: DashboardType,
    nullable: true,
    args: {
      idOrSlug: t.arg.string({ required: true }),
      hostId: t.arg.string({ required: false }),
      electorActivity: t.arg.string({ required: false }),
      activitySince: t.arg.string({ required: false }),
    },
    resolve: async (_p, args, ctx) => {
      const readable = await getReadableTimetable(
        ctx.user?.id ?? null,
        args.idOrSlug,
      );
      if (!readable) return null;
      const viewer = { userId: ctx.user?.id ?? null, roles: readable.roles };
      if (!canSeeHostOnly(viewer)) return null;
      const sinceMs = args.activitySince
        ? Date.parse(args.activitySince)
        : Number.NaN;
      return getDashboard(readable.timetable.id, {
        hostId: args.hostId ?? undefined,
        electorActivity: parseElectorActivityFilter(args.electorActivity),
        activitySince: Number.isNaN(sinceMs) ? undefined : new Date(sinceMs),
      });
    },
  }),

  /** Per-elector weights for one topic — fetched lazily by the dashboard's
   * "Show ❤️ breakdown" toggle (QA #59 round 3). Host/admin only. */
  topicWeightedBreakdown: t.field({
    type: [WeightedHeartType],
    nullable: true,
    args: {
      idOrSlug: t.arg.string({ required: true }),
      topicId: t.arg.string({ required: true }),
    },
    resolve: async (_p, args, ctx) => {
      const readable = await getReadableTimetable(
        ctx.user?.id ?? null,
        args.idOrSlug,
      );
      if (!readable) return null;
      const viewer = { userId: ctx.user?.id ?? null, roles: readable.roles };
      if (!canSeeHostOnly(viewer)) return null;
      return getWeightedBreakdown(readable.timetable.id, args.topicId);
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
