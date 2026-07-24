import { and, eq, gte, isNull, sql, type SQL } from "drizzle-orm";

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
import { buildFeed, type FeedTopic } from "./topics";

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

async function countTopicsByStatus(
  timetableId: string,
  hostId?: string,
): Promise<Record<TopicStatus, number>> {
  const conds = [eq(topics.timetableId, timetableId)];
  if (hostId) conds.push(eq(topics.hostId, hostId));

  const statusRows = await db
    .select({ status: topics.status, n: sql<number>`count(*)::int` })
    .from(topics)
    .where(and(...conds))
    .groupBy(topics.status);
  const topicCounts: Record<TopicStatus, number> = {
    submitted: 0,
    published: 0,
    unpublished: 0,
    archived: 0,
  };
  for (const r of statusRows) topicCounts[r.status] = r.n;
  return topicCounts;
}

/** Members with their roles; electors keep their name for the activity list. */
async function loadMembers(timetableId: string): Promise<{
  electorRows: { userId: string; name: string | null }[];
  hostCount: number;
}> {
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
  const hostCount = memberRows.filter((m) => m.roles.includes("host")).length;
  return { electorRows, hostCount };
}

async function countSlots(timetableId: string): Promise<number> {
  const [{ n } = { n: 0 }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(timeslots)
    .where(eq(timeslots.timetableId, timetableId));
  return n;
}

function buildLeaderboards(feed: FeedTopic[]): {
  topicLeaderboard: DashboardData["topicLeaderboard"];
  hostLeaderboard: DashboardData["hostLeaderboard"];
} {
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

  return { topicLeaderboard, hostLeaderboard };
}

/** WHERE fragments for the elector-activity window: published topics
 * (optionally one host's); hearts additionally post-cutoff and post-
 * activitySince. Elector activity starts at the explicit date, or the
 * hearts cutoff by default (QA #59 round 3). */
async function activityWindow(
  timetableId: string,
  opts: { hostId?: string; activitySince?: Date },
): Promise<{
  activityTopicConds: SQL[];
  heartCountConds: SQL[];
  activitySince: Date | undefined;
}> {
  const activityTopicConds = [
    eq(topics.timetableId, timetableId),
    eq(topics.status, "published" as const),
  ];
  if (opts.hostId) activityTopicConds.push(eq(topics.hostId, opts.hostId));

  const cutoff = await getHeartsCountFrom(timetableId);
  const activitySince = opts.activitySince ?? cutoff ?? undefined;
  const heartCountConds = [...activityTopicConds];
  if (cutoff) heartCountConds.push(gte(hearts.createdAt, cutoff));
  if (activitySince) {
    heartCountConds.push(gte(hearts.createdAt, activitySince));
  }

  return { activityTopicConds, heartCountConds, activitySince };
}

type HeartActivityRow = {
  electorId: string;
  topicId: string;
  title: string;
  slug: string | null;
  hostId: string;
  hostName: string | null;
  hostSlug: string | null;
  createdAt: Date;
};

/** One scan of the counted hearts (post-cutoff, activity window, optional
 * host filter). Per-elector stats, per-topic last-heart timestamps and the
 * per-elector hearted-topic lists are all derived from it in JS — this
 * replaces three queries that shared the same WHERE clause. The host join
 * can't drop rows: topics.hostId is NOT NULL with an FK to users. */
async function loadHeartActivity(
  heartCountConds: SQL[],
): Promise<HeartActivityRow[]> {
  return db
    .select({
      electorId: hearts.userId,
      topicId: topics.id,
      title: topics.title,
      slug: topics.slug,
      hostId: topics.hostId,
      hostName: users.name,
      hostSlug: users.slug,
      createdAt: hearts.createdAt,
    })
    .from(hearts)
    .innerJoin(topics, eq(topics.id, hearts.topicId))
    .innerJoin(users, eq(users.id, topics.hostId))
    .where(and(...heartCountConds));
}

/** Latest counted heart per topic (QA #42: heart timestamps on the
 * dashboard). */
function lastHeartByTopic(
  heartActivityRows: HeartActivityRow[],
): Map<string, Date | null> {
  const last = new Map<string, Date | null>();
  for (const r of heartActivityRows) {
    last.set(r.topicId, latestDate(last.get(r.topicId), r.createdAt));
  }
  return last;
}

function heartStatsByElector(
  heartActivityRows: HeartActivityRow[],
): Map<string, Stat> {
  const stats = new Map<string, Stat>();
  for (const r of heartActivityRows) {
    const cur = stats.get(r.electorId) ?? { count: 0, latestAt: null };
    cur.count += 1;
    cur.latestAt = latestDate(cur.latestAt, r.createdAt);
    stats.set(r.electorId, cur);
  }
  return stats;
}

/** Per-elector hearted topics for the "Show ❤️s" toggle — same cutoff/filter
 * as the heart counts, with the host attached so the UI can group by host. */
function heartedTopicsByElector(
  heartActivityRows: HeartActivityRow[],
): Map<string, DashboardData["electorActivity"][number]["heartedTopics"]> {
  const byElector = new Map<
    string,
    DashboardData["electorActivity"][number]["heartedTopics"]
  >();
  for (const r of heartActivityRows) {
    const list = byElector.get(r.electorId) ?? [];
    list.push({
      topicId: r.topicId,
      title: r.title,
      slug: r.slug,
      hostId: r.hostId,
      hostName: r.hostName,
      hostSlug: r.hostSlug,
    });
    byElector.set(r.electorId, list);
  }
  return byElector;
}

/** Index grouped per-elector count/latest rows by elector id. */
function statsBy(
  rows: { electorId: string; count: number; latestAt: Date | null }[],
): Map<string, Stat> {
  return new Map(
    rows.map((row) => [
      row.electorId,
      { count: row.count, latestAt: row.latestAt },
    ]),
  );
}

/** Public, non-hidden comments per elector inside the activity window. */
async function loadCommentActivity(
  activityTopicConds: SQL[],
  activitySince: Date | undefined,
): Promise<Map<string, Stat>> {
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
  return statsBy(commentRows);
}

/** Availability updates per elector inside the activity window. */
async function loadAvailabilityActivity(
  timetableId: string,
  activitySince: Date | undefined,
): Promise<Map<string, Stat>> {
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
  return statsBy(availabilityRows);
}

function compareElectorActivity(
  a: DashboardData["electorActivity"][number],
  b: DashboardData["electorActivity"][number],
): number {
  const at = a.latestActivityAt?.getTime() ?? 0;
  const bt = b.latestActivityAt?.getTime() ?? 0;
  if (bt !== at) return bt - at;
  const aTotal = a.heartCount + a.commentCount + a.availabilityCount;
  const bTotal = b.heartCount + b.commentCount + b.availabilityCount;
  if (bTotal !== aTotal) return bTotal - aTotal;
  return (a.electorName ?? a.electorId).localeCompare(
    b.electorName ?? b.electorId,
  );
}

function buildElectorActivity(args: {
  electorRows: { userId: string; name: string | null }[];
  heartActivityRows: HeartActivityRow[];
  commentsByElector: Map<string, Stat>;
  availabilityByElector: Map<string, Stat>;
  filter: ElectorActivityFilter;
}): DashboardData["electorActivity"] {
  const heartsByElector = heartStatsByElector(args.heartActivityRows);
  const heartedByElector = heartedTopicsByElector(args.heartActivityRows);

  return args.electorRows
    .map((elector) => {
      const heartStat = heartsByElector.get(elector.userId);
      const commentStat = args.commentsByElector.get(elector.userId);
      const availabilityStat = args.availabilityByElector.get(elector.userId);
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
        heartedTopics: heartedByElector.get(elector.userId) ?? [],
      };
    })
    .filter((row) => matchesActivityFilter(row, args.filter))
    .sort(compareElectorActivity);
}

type SlotTagRow = {
  slotId: string;
  topicId: string;
  title: string;
  hostId: string;
  startsAt: Date;
  location: string;
};

/** Topic↔slot tags for this timetable, with slot metadata for conflicts. */
async function loadSlotTagRows(timetableId: string): Promise<SlotTagRow[]> {
  return db
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
}

/** Published topics not tagged into any slot. */
function findUnallocated(
  feed: FeedTopic[],
  tagRows: SlotTagRow[],
): DashboardData["unallocatedTopics"] {
  const taggedTopicIds = new Set(tagRows.map((r) => r.topicId));
  return feed
    .filter((t) => !taggedTopicIds.has(t.id))
    .map((t) => ({
      id: t.id,
      title: t.title,
      slug: t.slug,
      hostSlug: t.hostSlug,
    }));
}

/** Slots with more than one tagged topic = conflicts. */
function findConflicts(
  tagRows: SlotTagRow[],
  hostId?: string,
): DashboardData["conflicts"] {
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
  return Array.from(bySlot.values())
    .filter(
      (s) =>
        s.topics.length > 1 &&
        (!hostId || s.topics.some((topic) => topic.hostId === hostId)),
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
  const topicCounts = await countTopicsByStatus(timetableId, opts.hostId);
  const { electorRows, hostCount } = await loadMembers(timetableId);
  const electorCount = electorRows.length;
  const slotCount = await countSlots(timetableId);

  // Weighted feed gives published topics with scores + host names.
  const feed = await buildFeed(timetableId, null, {
    hostId: opts.hostId,
    sort: "hearts",
  });
  const totalHearts = feed.reduce((sum, t) => sum + t.heartCount, 0);
  const { topicLeaderboard, hostLeaderboard } = buildLeaderboards(feed);

  const { activityTopicConds, heartCountConds, activitySince } =
    await activityWindow(timetableId, opts);

  const heartActivityRows = await loadHeartActivity(heartCountConds);
  const lastHearts = lastHeartByTopic(heartActivityRows);
  for (const t of topicLeaderboard) {
    t.lastHeartAt = lastHearts.get(t.id) ?? null;
  }

  const commentsByElector = await loadCommentActivity(
    activityTopicConds,
    activitySince,
  );
  const availabilityByElector = await loadAvailabilityActivity(
    timetableId,
    activitySince,
  );

  const electorActivity = buildElectorActivity({
    electorRows,
    heartActivityRows,
    commentsByElector,
    availabilityByElector,
    filter: opts.electorActivity ?? "all",
  });

  const tagRows = await loadSlotTagRows(timetableId);
  const unallocatedTopics = findUnallocated(feed, tagRows);
  const conflicts = findConflicts(tagRows, opts.hostId);

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
