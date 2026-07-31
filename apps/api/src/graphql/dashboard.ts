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
import { TimetableType, WeightedHeartType } from "./types";

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
      hostId: t.exposeID("hostId"),
      hostName: t.exposeString("hostName", { nullable: true }),
      hostImage: t.exposeString("hostImage", { nullable: true }),
      hostSlug: t.exposeString("hostSlug", { nullable: true }),
      weightedScore: t.exposeFloat("weightedScore"),
      l2Score: t.exposeFloat("l2Score"),
      devotionScore: t.exposeFloat("devotionScore"),
      heartCount: t.exposeInt("heartCount"),
      commentTotal: t.exposeInt("commentTotal"),
      commenterCount: t.exposeInt("commenterCount"),
      commentL2: t.exposeFloat("commentL2"),
      commentL1: t.exposeFloat("commentL1"),
      commentDevotion: t.exposeFloat("commentDevotion"),
    }),
  });

const HostActivityType = builder
  .objectRef<DashboardData["hostActivity"][number]>("HostActivity")
  .implement({
    fields: (t) => ({
      hostId: t.exposeID("hostId"),
      hostName: t.exposeString("hostName", { nullable: true }),
      hostImage: t.exposeString("hostImage", { nullable: true }),
      hostSlug: t.exposeString("hostSlug", { nullable: true }),
      topicCount: t.exposeInt("topicCount"),
      commentCount: t.exposeInt("commentCount"),
      latestActivityAt: t.string({
        nullable: true,
        resolve: (h) => h.latestActivityAt?.toISOString() ?? null,
      }),
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
      commentCount: t.exposeInt("commentCount"),
    }),
  });

const ElectorActivityType = builder
  .objectRef<DashboardData["electorActivity"][number]>("ElectorActivity")
  .implement({
    fields: (t) => ({
      electorId: t.exposeID("electorId"),
      electorName: t.exposeString("electorName", { nullable: true }),
      electorImage: t.exposeString("electorImage", { nullable: true }),
      heartCount: t.exposeInt("heartCount"),
      commentCount: t.exposeInt("commentCount"),
      availabilityCount: t.exposeInt("availabilityCount"),
      /** Published topics never seen nor ❤️'d — the queue coverage gap. */
      queueCount: t.exposeInt("queueCount"),
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
    hostActivity: t.field({
      type: [HostActivityType],
      resolve: (d) => d.hostActivity,
    }),
    unallocatedTopics: t.field({
      type: [UnallocatedTopicType],
      resolve: (d) => d.unallocatedTopics,
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
      /** Separate host filter for the elector-activity table (per-table
       * filters, QA 2026-07-27). */
      activityHostId: t.arg.string({ required: false }),
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
        activityHostId: args.activityHostId ?? undefined,
        electorActivity: parseElectorActivityFilter(args.electorActivity),
        activitySince: Number.isNaN(sinceMs) ? undefined : new Date(sinceMs),
      });
    },
  }),

  /** Per-elector weights for one topic — fetched lazily by the ❤️-breakdown
   * disclosures on topic cards and Analysis rows. Any signed-in reader
   * (QA 2026-07-27; was host/admin only — who-hearts-what is already
   * reader-visible via person pages, and the weights derive from it. The
   * one genuinely new datum for electors is each ❤️'s date). */
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
      if (!ctx.user) return null;
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
  forumByDomain: t.field({
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
