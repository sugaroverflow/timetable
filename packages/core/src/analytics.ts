import { and, eq, gte, isNull, sql } from "drizzle-orm";

import {
  availability,
  comments,
  db,
  hearts,
  slotTopics,
  timeslots,
  timetableMemberships,
  topics,
  users,
  type TopicStatus,
} from "@timetable/db";

import { coerceDate } from "./dates";
import { getHeartsCountFrom } from "./topics";
import { buildFeed } from "./topics";

export const ELECTOR_ACTIVITY_FILTERS = [
  "all",
  "active",
  "quiet",
  "no_hearts",
  "no_comments",
  "no_availability",
] as const;

export type ElectorActivityFilter = (typeof ELECTOR_ACTIVITY_FILTERS)[number];

export type DashboardData = {
  topicCounts: Record<TopicStatus, number>;
  totalHearts: number;
  electorCount: number;
  hostCount: number;
  slotCount: number;
  topicLeaderboard: {
    id: string;
    title: string;
    slug: string | null;
    hostName: string | null;
    hostSlug: string | null;
    weightedScore: number;
    l2Score: number;
    devotionScore: number;
    heartCount: number;
    lastHeartAt: Date | null;
  }[];
  hostLeaderboard: {
    hostId: string;
    hostName: string | null;
    weightedScore: number;
  }[];
  electorActivity: {
    electorId: string;
    electorName: string | null;
    heartCount: number;
    commentCount: number;
    availabilityCount: number;
    latestActivityAt: Date | null;
    /** Topics this elector hearted (grouped by host in the UI). */
    heartedTopics: {
      topicId: string;
      title: string;
      slug: string | null;
      hostId: string;
      hostName: string | null;
      hostSlug: string | null;
    }[];
  }[];
  unallocatedTopics: {
    id: string;
    title: string;
    slug: string | null;
    hostSlug: string | null;
  }[];
  conflicts: {
    slotId: string;
    startsAt: Date;
    location: string;
    topics: { id: string; title: string }[];
  }[];
};

type Stat = { count: number; latestAt: Date | null };

function latestDate(
  ...dates: (Date | string | null | undefined)[]
): Date | null {
  let latest: Date | null = null;
  for (const raw of dates) {
    const date = coerceDate(raw);
    if (!date) continue;
    if (!latest || date.getTime() > latest.getTime()) latest = date;
  }
  return latest;
}

function matchesActivityFilter(
  row: DashboardData["electorActivity"][number],
  filter: ElectorActivityFilter,
): boolean {
  const total = row.heartCount + row.commentCount + row.availabilityCount;
  switch (filter) {
    case "active":
      return total > 0;
    case "quiet":
      return total === 0;
    case "no_hearts":
      return row.heartCount === 0;
    case "no_comments":
      return row.commentCount === 0;
    case "no_availability":
      return row.availabilityCount === 0;
    case "all":
      return true;
  }
}

export async function getDashboard(
  timetableId: string,
  opts: {
    hostId?: string;
    electorActivity?: ElectorActivityFilter;
    /** Only count elector activity on/after this date (QA #59 round 3);
     * the UI defaults it to the hearts cutoff. */
    activitySince?: Date;
  } = {},
): Promise<DashboardData> {
  const emptyCounts: Record<TopicStatus, number> = {
    submitted: 0,
    published: 0,
    unpublished: 0,
    archived: 0,
  };

  const topicStatusConds = [eq(topics.timetableId, timetableId)];
  if (opts.hostId) topicStatusConds.push(eq(topics.hostId, opts.hostId));

  const statusRows = await db
    .select({ status: topics.status, n: sql<number>`count(*)::int` })
    .from(topics)
    .where(and(...topicStatusConds))
    .groupBy(topics.status);
  const topicCounts = { ...emptyCounts };
  for (const r of statusRows) topicCounts[r.status] = r.n;

  const memberRows = await db
    .select({
      userId: timetableMemberships.userId,
      roles: timetableMemberships.roles,
      name: users.name,
    })
    .from(timetableMemberships)
    .innerJoin(users, eq(users.id, timetableMemberships.userId))
    .where(eq(timetableMemberships.timetableId, timetableId));
  const electorRows = memberRows.filter((m) => m.roles.includes("elector"));
  const electorCount = memberRows.filter((m) =>
    m.roles.includes("elector"),
  ).length;
  const hostCount = memberRows.filter((m) => m.roles.includes("host")).length;

  const [{ n: slotCount } = { n: 0 }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(timeslots)
    .where(eq(timeslots.timetableId, timetableId));

  // Weighted feed gives published topics with scores + host names.
  const feed = await buildFeed(timetableId, null, {
    hostId: opts.hostId,
    sort: "hearts",
  });
  const totalHearts = feed.reduce((sum, t) => sum + t.heartCount, 0);

  // All published topics, not a top-10 — QA #42 wants the dashboard to show
  // every host and every topic, each linked to its permalink.
  const topicLeaderboard = feed.map((t) => ({
    id: t.id,
    title: t.title,
    slug: t.slug,
    hostName: t.hostName,
    hostSlug: t.hostSlug,
    weightedScore: t.weightedScore,
    l2Score: t.l2Score,
    devotionScore: t.devotionScore,
    heartCount: t.heartCount,
    lastHeartAt: null as Date | null,
  }));

  const hostAgg = new Map<
    string,
    { hostId: string; hostName: string | null; weightedScore: number }
  >();
  for (const t of feed) {
    const cur = hostAgg.get(t.hostId) ?? {
      hostId: t.hostId,
      hostName: t.hostName,
      weightedScore: 0,
    };
    cur.weightedScore += t.weightedScore;
    hostAgg.set(t.hostId, cur);
  }
  const hostLeaderboard = Array.from(hostAgg.values()).sort(
    (a, b) => b.weightedScore - a.weightedScore,
  );

  const activityTopicConds = [
    eq(topics.timetableId, timetableId),
    eq(topics.status, "published" as const),
  ];
  if (opts.hostId) activityTopicConds.push(eq(topics.hostId, opts.hostId));

  const cutoff = await getHeartsCountFrom(timetableId);
  // Elector activity starts at the explicit date, or the hearts cutoff by
  // default (QA #59 round 3).
  const activitySince = opts.activitySince ?? cutoff ?? undefined;
  const heartCountConds = [...activityTopicConds];
  if (cutoff) heartCountConds.push(gte(hearts.createdAt, cutoff));
  if (activitySince) {
    heartCountConds.push(gte(hearts.createdAt, activitySince));
  }

  const heartRows = await db
    .select({
      electorId: hearts.userId,
      count: sql<number>`count(*)::int`,
      latestAt: sql<Date | null>`max(${hearts.createdAt})`,
    })
    .from(hearts)
    .innerJoin(topics, eq(topics.id, hearts.topicId))
    .where(and(...heartCountConds))
    .groupBy(hearts.userId);

  // Latest counted heart per topic (QA #42: heart timestamps on the
  // dashboard).
  const lastHeartRows = await db
    .select({
      topicId: hearts.topicId,
      lastAt: sql<Date | null>`max(${hearts.createdAt})`,
    })
    .from(hearts)
    .innerJoin(topics, eq(topics.id, hearts.topicId))
    .where(and(...heartCountConds))
    .groupBy(hearts.topicId);
  const lastHeartByTopic = new Map(
    lastHeartRows.map((r) => [r.topicId, coerceDate(r.lastAt)]),
  );
  for (const t of topicLeaderboard) {
    t.lastHeartAt = lastHeartByTopic.get(t.id) ?? null;
  }

  // Per-elector hearted topics for the "Show ❤️s" toggle — same cutoff/filter
  // as the heart counts, joined to the host so the UI can group by host.
  const heartedTopicRows = await db
    .select({
      electorId: hearts.userId,
      topicId: topics.id,
      title: topics.title,
      slug: topics.slug,
      hostId: topics.hostId,
      hostName: users.name,
      hostSlug: users.slug,
    })
    .from(hearts)
    .innerJoin(topics, eq(topics.id, hearts.topicId))
    .innerJoin(users, eq(users.id, topics.hostId))
    .where(and(...heartCountConds));
  const heartedTopicsByElector = new Map<
    string,
    DashboardData["electorActivity"][number]["heartedTopics"]
  >();
  for (const r of heartedTopicRows) {
    const list = heartedTopicsByElector.get(r.electorId) ?? [];
    list.push({
      topicId: r.topicId,
      title: r.title,
      slug: r.slug,
      hostId: r.hostId,
      hostName: r.hostName,
      hostSlug: r.hostSlug,
    });
    heartedTopicsByElector.set(r.electorId, list);
  }

  const commentRows = await db
    .select({
      electorId: comments.authorId,
      count: sql<number>`count(*)::int`,
      latestAt: sql<Date | null>`max(${comments.createdAt})`,
    })
    .from(comments)
    .innerJoin(topics, eq(topics.id, comments.topicId))
    .where(
      and(
        ...activityTopicConds,
        eq(comments.visibility, "public" as const),
        isNull(comments.hiddenAt),
        ...(activitySince ? [gte(comments.createdAt, activitySince)] : []),
      ),
    )
    .groupBy(comments.authorId);

  const availabilityRows = await db
    .select({
      electorId: availability.userId,
      count: sql<number>`count(*)::int`,
      latestAt: sql<Date | null>`max(${availability.updatedAt})`,
    })
    .from(availability)
    .innerJoin(timeslots, eq(timeslots.id, availability.slotId))
    .where(
      and(
        eq(timeslots.timetableId, timetableId),
        ...(activitySince ? [gte(availability.updatedAt, activitySince)] : []),
      ),
    )
    .groupBy(availability.userId);

  const heartsByElector = new Map<string, Stat>();
  for (const row of heartRows) {
    heartsByElector.set(row.electorId, {
      count: row.count,
      latestAt: row.latestAt,
    });
  }

  const commentsByElector = new Map<string, Stat>();
  for (const row of commentRows) {
    commentsByElector.set(row.electorId, {
      count: row.count,
      latestAt: row.latestAt,
    });
  }

  const availabilityByElector = new Map<string, Stat>();
  for (const row of availabilityRows) {
    availabilityByElector.set(row.electorId, {
      count: row.count,
      latestAt: row.latestAt,
    });
  }

  const activityFilter = opts.electorActivity ?? "all";
  const electorActivity = electorRows
    .map((elector) => {
      const heartStat = heartsByElector.get(elector.userId);
      const commentStat = commentsByElector.get(elector.userId);
      const availabilityStat = availabilityByElector.get(elector.userId);
      return {
        electorId: elector.userId,
        electorName: elector.name,
        heartCount: heartStat?.count ?? 0,
        commentCount: commentStat?.count ?? 0,
        availabilityCount: availabilityStat?.count ?? 0,
        latestActivityAt: latestDate(
          heartStat?.latestAt,
          commentStat?.latestAt,
          availabilityStat?.latestAt,
        ),
        heartedTopics: heartedTopicsByElector.get(elector.userId) ?? [],
      };
    })
    .filter((row) => matchesActivityFilter(row, activityFilter))
    .sort((a, b) => {
      const at = a.latestActivityAt?.getTime() ?? 0;
      const bt = b.latestActivityAt?.getTime() ?? 0;
      if (bt !== at) return bt - at;
      const aTotal = a.heartCount + a.commentCount + a.availabilityCount;
      const bTotal = b.heartCount + b.commentCount + b.availabilityCount;
      if (bTotal !== aTotal) return bTotal - aTotal;
      return (a.electorName ?? a.electorId).localeCompare(
        b.electorName ?? b.electorId,
      );
    });

  // Tagged topic ids (this timetable) -> unallocated = published not tagged.
  const tagRows = await db
    .select({
      slotId: slotTopics.slotId,
      topicId: slotTopics.topicId,
      title: topics.title,
      hostId: topics.hostId,
      startsAt: timeslots.startsAt,
      location: timeslots.location,
    })
    .from(slotTopics)
    .innerJoin(timeslots, eq(timeslots.id, slotTopics.slotId))
    .innerJoin(topics, eq(topics.id, slotTopics.topicId))
    .where(eq(timeslots.timetableId, timetableId));

  const taggedTopicIds = new Set(tagRows.map((r) => r.topicId));
  const unallocatedTopics = feed
    .filter((t) => !taggedTopicIds.has(t.id))
    .map((t) => ({
      id: t.id,
      title: t.title,
      slug: t.slug,
      hostSlug: t.hostSlug,
    }));

  // Slots with more than one tagged topic = conflicts.
  const bySlot = new Map<
    string,
    {
      slotId: string;
      startsAt: Date;
      location: string;
      topics: { id: string; title: string; hostId: string }[];
    }
  >();
  for (const r of tagRows) {
    const entry = bySlot.get(r.slotId) ?? {
      slotId: r.slotId,
      startsAt: r.startsAt,
      location: r.location,
      topics: [],
    };
    entry.topics.push({ id: r.topicId, title: r.title, hostId: r.hostId });
    bySlot.set(r.slotId, entry);
  }
  const conflicts = Array.from(bySlot.values())
    .filter(
      (s) =>
        s.topics.length > 1 &&
        (!opts.hostId ||
          s.topics.some((topic) => topic.hostId === opts.hostId)),
    )
    .map((slot) => ({
      slotId: slot.slotId,
      startsAt: slot.startsAt,
      location: slot.location,
      topics: slot.topics.map((topic) => ({
        id: topic.id,
        title: topic.title,
      })),
    }));

  return {
    topicCounts,
    totalHearts,
    electorCount,
    hostCount,
    slotCount,
    topicLeaderboard,
    hostLeaderboard,
    electorActivity,
    unallocatedTopics,
    conflicts,
  };
}
