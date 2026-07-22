import {
  getDashboard,
  getOrCreateIcsToken,
  getTimetableByDomain,
  getWeightedBreakdown,
  type DashboardData,
} from "@timetable/core";
import { canSeeHostOnly } from "@timetable/shared";

import { builder } from "./builder";
import {
  parseElectorActivityFilter,
  readTimetable,
  requireUser,
} from "./guards";
import { SlotTagType, TimetableType, WeightedHeartType } from "./types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

const TopicCountsType = builder
  .objectRef<DashboardData["topicCounts"]>("TopicCounts")
  .implement({
    fields: (t) => ({
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

const DashboardType = builder.objectRef<DashboardData>("Dashboard").implement({
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

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

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
      const readable = await readTimetable(ctx, args.idOrSlug);
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
      const readable = await readTimetable(ctx, args.idOrSlug);
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
      const readable = await readTimetable(ctx, timetable.id);
      if (!readable) return null;
      return { ...readable.timetable, viewerRoles: readable.roles as string[] };
    },
  }),
}));
