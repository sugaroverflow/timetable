import {
  getDashboard,
  getHostHeartBreakdown,
  getOrCreateIcsToken,
  getTimetableByDomain,
  getWeightedBreakdown,
  type DashboardData,
  type WeightedHeartEntry,
} from "@timetable/core";
import {
  canSeeComments,
  canSeeHostHeartTallies,
  canSeeHostOnly,
  type Role,
} from "@timetable/shared";

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

/** Leaderboard/host-activity rows carry a per-request flag instead of the
 * dashboard query returning different shapes: 💙 fields resolve to null
 * unless the viewer may see host-heart tallies (admins — the dashboard
 * itself is host-visible, so the gate must be finer than the query's). */
type GqlLeaderboardEntry = DashboardData["topicLeaderboard"][number] & {
  showHostHearts: boolean;
};
type GqlHostActivity = DashboardData["hostActivity"][number] & {
  showHostHearts: boolean;
};

const TopicLeaderboardEntryType = builder
  .objectRef<GqlLeaderboardEntry>("TopicLeaderboardEntry")
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
      // 💙 metrics — admin eyes only (host hearts, 2026-08-04).
      hostHeartCount: t.int({
        nullable: true,
        resolve: (r) => (r.showHostHearts ? r.hostHeartCount : null),
      }),
      hostHeartL2: t.float({
        nullable: true,
        resolve: (r) => (r.showHostHearts ? r.hostHeartL2 : null),
      }),
      hostHeartL1: t.float({
        nullable: true,
        resolve: (r) => (r.showHostHearts ? r.hostHeartL1 : null),
      }),
      hostHeartDevotion: t.float({
        nullable: true,
        resolve: (r) => (r.showHostHearts ? r.hostHeartDevotion : null),
      }),
    }),
  });

const HostActivityType = builder
  .objectRef<GqlHostActivity>("HostActivity")
  .implement({
    fields: (t) => ({
      hostId: t.exposeID("hostId"),
      hostName: t.exposeString("hostName", { nullable: true }),
      hostImage: t.exposeString("hostImage", { nullable: true }),
      hostSlug: t.exposeString("hostSlug", { nullable: true }),
      topicCount: t.exposeInt("topicCount"),
      commentCount: t.exposeInt("commentCount"),
      /** 💙s this host has given — admin eyes only. */
      hostHeartCount: t.int({
        nullable: true,
        resolve: (r) => (r.showHostHearts ? r.hostHeartCount : null),
      }),
      /** The topics behind that count — the row's fold-open sub-table,
       * same shape as the elector rows' heartedTopics. Admin eyes only. */
      hostHeartedTopics: t.field({
        type: [ElectorHeartedTopicType],
        nullable: true,
        resolve: (r) => (r.showHostHearts ? r.hostHeartedTopics : null),
      }),
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

/** Same entry math as WeightedHeart, renamed for the public surface: these
 * are hosts, not electors (host hearts, 2026-08-04). */
const HostHeartBreakdownEntryType = builder
  .objectRef<WeightedHeartEntry>("HostHeartBreakdownEntry")
  .implement({
    fields: (t) => ({
      hostId: t.id({ resolve: (w) => w.electorId }),
      hostName: t.string({
        nullable: true,
        resolve: (w) => w.electorName,
      }),
      hostImage: t.string({
        nullable: true,
        resolve: (w) => w.electorImage,
      }),
      weight: t.exposeFloat("weight"),
      l2Weight: t.exposeFloat("l2Weight"),
      devotionWeight: t.exposeFloat("devotionWeight"),
      heartedAt: t.string({ resolve: (w) => w.heartedAt.toISOString() }),
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

type GqlDashboard = DashboardData & {
  /** Whether this viewer may see 💙 tallies (admins only). */
  showHostHearts: boolean;
};

const DashboardType = builder.objectRef<GqlDashboard>("Dashboard").implement({
  fields: (t) => ({
    totalHearts: t.exposeInt("totalHearts"),
    electorCount: t.exposeInt("electorCount"),
    hostCount: t.exposeInt("hostCount"),
    topicCounts: t.field({
      type: TopicCountsType,
      resolve: (d) => d.topicCounts,
    }),
    topicLeaderboard: t.field({
      type: [TopicLeaderboardEntryType],
      resolve: (d) =>
        d.topicLeaderboard.map((r) => ({
          ...r,
          showHostHearts: d.showHostHearts,
        })),
    }),
    hostActivity: t.field({
      type: [HostActivityType],
      resolve: (d) =>
        d.hostActivity.map((r) => ({
          ...r,
          showHostHearts: d.showHostHearts,
        })),
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
      const data = await getDashboard(readable.timetable.id, {
        hostId: args.hostId ?? undefined,
        activityHostId: args.activityHostId ?? undefined,
        electorActivity: parseElectorActivityFilter(args.electorActivity),
        activitySince: Number.isNaN(sinceMs) ? undefined : new Date(sinceMs),
      });
      return { ...data, showHostHearts: canSeeHostHeartTallies(viewer) };
    },
  }),

  /** Per-host 💙 breakdown for one topic — the hosts-instead-of-electors
   * dropdown when the analysis table sorts by 💙. Admin eyes only. */
  topicHostHeartBreakdown: t.field({
    type: [HostHeartBreakdownEntryType],
    nullable: true,
    args: {
      idOrSlug: t.arg.string({ required: true }),
      topicId: t.arg.string({ required: true }),
    },
    resolve: async (_p, args, ctx) => {
      const readable = await readTimetable(ctx, args.idOrSlug);
      if (!readable) return null;
      const viewer = { userId: ctx.user?.id ?? null, roles: readable.roles };
      if (!canSeeHostHeartTallies(viewer)) return null;
      return getHostHeartBreakdown(readable.timetable.id, args.topicId);
    },
  }),

  /** Per-elector weights for one topic — fetched lazily by the ❤️-breakdown
   * disclosures on topic cards and Analysis rows. Any signed-in reader on a
   * public forum, members elsewhere (QA 2026-07-27 opened it to signed-in
   * readers because who-hearts-what is reader-visible via person pages —
   * but hosts_only forums deliberately hide the elector membership from
   * the public, so the audit 2026-08-17 re-scoped it to canSeeComments,
   * the same "member or public forum" line the rest of the matrix draws). */
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
      const viewer = { userId: ctx.user.id, roles: readable.roles as Role[] };
      if (!canSeeComments(readable.timetable.privacy, viewer)) return null;
      return getWeightedBreakdown(readable.timetable.id, args.topicId);
    },
  }),

  /** The current user's ICS subscription token (created on first use). */
  myIcsToken: t.field({
    type: "String",
    nullable: true,
    resolve: async (_p, _a, ctx) => {
      const user = await requireUser(ctx);
      // Never mint the target's long-lived calendar credential for a
      // view-as preview — it would keep working after the preview ends.
      if (ctx.impersonation) return null;
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
