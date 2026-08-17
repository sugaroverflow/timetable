import { and, eq, gte, isNull, ne, sql, type SQL } from "drizzle-orm";

import {
  availability,
  comments,
  db,
  hearts,
  hostHearts,
  slotSessions,
  timeslots,
  timetableMemberships,
  topics,
  type TopicStatus,
} from "@timetable/db";

import {
  topicCommentScores,
  type CommentTally,
  type TopicCommentScores,
  type TopicNormScores,
} from "@timetable/shared";

import { coerceDate } from "./dates";
import { computeHostHeartScores } from "./hostHearts";
import { loadQueueCoverage } from "./queue";
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
  topicLeaderboard: {
    id: string;
    title: string;
    slug: string | null;
    hostId: string;
    hostName: string | null;
    hostImage: string | null;
    hostSlug: string | null;
    weightedScore: number;
    l2Score: number;
    devotionScore: number;
    heartCount: number;
    /** 💬 metrics (QA 2026-07-27): elector-authored public comments only,
     * never the topic's own host, same activity window as the ❤️ counts.
     * The math is `topicCommentScores` in @timetable/shared. */
    commentTotal: number;
    commenterCount: number;
    commentL2: number;
    commentL1: number;
    commentDevotion: number;
    /** 💙 metrics (host hearts, 2026-08-04): same four normalisations over
     * the host_hearts rows. Admin eyes only — the API nulls these for
     * non-admin dashboard viewers. */
    hostHeartCount: number;
    hostHeartL2: number;
    hostHeartL1: number;
    hostHeartDevotion: number;
  }[];
  /** Host activity (QA 2026-07-27, replaced the weighted-votes host
   * leaderboard): every host-role member — topic-less ones included —
   * with their published-topic count, public comments authored, and
   * latest activity (topic publish/edit or comment) in the window. */
  hostActivity: {
    hostId: string;
    hostName: string | null;
    hostImage: string | null;
    hostSlug: string | null;
    topicCount: number;
    commentCount: number;
    /** 💙s this host has given (host hearts, 2026-08-04). Admin eyes only —
     * nulled by the API for non-admin viewers; deliberately NOT folded into
     * latestActivityAt so nothing about 💙 timing leaks to hosts. */
    hostHeartCount: number;
    /** The topics this host 💙'd (the row's fold-open sub-table, mirroring
     * the elector rows' heartedTopics). Admin eyes only, same as the count.
     * `commentCount` is this host's public comments on that topic. */
    hostHeartedTopics: {
      topicId: string;
      title: string;
      slug: string | null;
      hostId: string;
      hostName: string | null;
      hostSlug: string | null;
      commentCount: number;
    }[];
    latestActivityAt: Date | null;
  }[];
  electorActivity: {
    electorId: string;
    electorName: string | null;
    electorImage: string | null;
    heartCount: number;
    commentCount: number;
    availabilityCount: number;
    /** Published topics this elector has never seen nor hearted (the
     * Topic Queue coverage gap, 2026-07-28). */
    queueCount: number;
    latestActivityAt: Date | null;
    /** Topics this elector hearted (a sortable sub-table in the UI). */
    heartedTopics: {
      topicId: string;
      title: string;
      slug: string | null;
      hostId: string;
      hostName: string | null;
      hostSlug: string | null;
      /** This elector's public comments on this topic. */
      commentCount: number;
    }[];
  }[];
  unallocatedTopics: {
    id: string;
    title: string;
    slug: string | null;
    hostSlug: string | null;
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
  electorRows: { userId: string; name: string | null; image: string | null }[];
  hostRows: {
    userId: string;
    name: string | null;
    image: string | null;
    slug: string | null;
  }[];
}> {
  const memberRows = await db
    .select({
      userId: timetableMemberships.userId,
      roles: timetableMemberships.roles,
      name: timetableMemberships.name,
      image: timetableMemberships.image,
      slug: timetableMemberships.slug,
    })
    .from(timetableMemberships)
    .where(eq(timetableMemberships.timetableId, timetableId));
  const electorRows = memberRows.filter((m) => m.roles.includes("elector"));
  const hostRows = memberRows.filter((m) => m.roles.includes("host"));
  return { electorRows, hostRows };
}

function commentScoreFields(c: TopicCommentScores | undefined) {
  return {
    commentTotal: c?.total ?? 0,
    commenterCount: c?.commenters ?? 0,
    commentL2: c?.l2 ?? 0,
    commentL1: c?.l1 ?? 0,
    commentDevotion: c?.devotion ?? 0,
  };
}

function hostHeartScoreFields(hh: TopicNormScores | undefined) {
  return {
    hostHeartCount: hh?.raw ?? 0,
    hostHeartL2: hh?.l2 ?? 0,
    hostHeartL1: hh?.l1 ?? 0,
    hostHeartDevotion: hh?.devotion ?? 0,
  };
}

function buildLeaderboards(
  feed: FeedTopic[],
  commentScores: Map<string, TopicCommentScores>,
  hostHeartScores: Map<string, TopicNormScores>,
): DashboardData["topicLeaderboard"] {
  // All published topics, not a top-10 — QA #42 wants the dashboard to show
  // every host and every topic, each linked to its permalink.
  return feed.map((t) => ({
    id: t.id,
    title: t.title,
    slug: t.slug,
    hostId: t.hostId,
    hostName: t.hostName,
    hostImage: t.hostImage,
    hostSlug: t.hostSlug,
    weightedScore: t.weightedScore,
    l2Score: t.l2Score,
    devotionScore: t.devotionScore,
    heartCount: t.heartCount,
    ...commentScoreFields(commentScores.get(t.id)),
    ...hostHeartScoreFields(hostHeartScores.get(t.id)),
  }));
}

/** Published-topic count + latest publish/edit per host, forum-wide — the
 * host-activity table ignores the per-table host filters (QA 2026-07-27),
 * so it can't reuse the possibly-filtered feed. */
async function loadHostTopicStats(
  timetableId: string,
): Promise<Map<string, Stat>> {
  const rows = await db
    .select({
      hostId: topics.hostId,
      count: sql<number>`count(*)::int`,
      latestAt: sql<Date | null>`max(greatest(coalesce(${topics.publishedAt}, ${topics.createdAt}), coalesce(${topics.contentUpdatedAt}, ${topics.createdAt})))`,
    })
    .from(topics)
    .where(
      and(
        eq(topics.timetableId, timetableId),
        eq(topics.status, "published" as const),
      ),
    )
    .groupBy(topics.hostId);
  return new Map(
    rows.map((r) => [
      r.hostId,
      { count: r.count, latestAt: coerceDate(r.latestAt) },
    ]),
  );
}

/** Host activity rows: every host-role member (topic-less included, matching
 * the hostCount decision), never narrowed by either host filter. */
function buildHostActivity(args: {
  hostRows: {
    userId: string;
    name: string | null;
    image: string | null;
    slug: string | null;
  }[];
  topicStats: Map<string, Stat>;
  commentsByAuthor: Map<string, Stat>;
  hostHeartRows: HeartActivityRow[];
  commentsByAuthorTopic: Map<string, number>;
}): DashboardData["hostActivity"] {
  const givenByHost = heartStatsByElector(args.hostHeartRows);
  const heartedByHost = heartedTopicsByElector(
    args.hostHeartRows,
    args.commentsByAuthorTopic,
  );
  return args.hostRows
    .map((h) => {
      const topicStat = args.topicStats.get(h.userId);
      const commentStat = args.commentsByAuthor.get(h.userId);
      return {
        hostId: h.userId,
        hostName: h.name,
        hostImage: h.image,
        hostSlug: h.slug,
        topicCount: topicStat?.count ?? 0,
        commentCount: commentStat?.count ?? 0,
        hostHeartCount: givenByHost.get(h.userId)?.count ?? 0,
        hostHeartedTopics: heartedByHost.get(h.userId) ?? [],
        latestActivityAt: latestDate(
          topicStat?.latestAt,
          commentStat?.latestAt,
        ),
      };
    })
    .sort(
      (a, b) =>
        (b.latestActivityAt?.getTime() ?? 0) -
        (a.latestActivityAt?.getTime() ?? 0),
    );
}

/** WHERE fragments for the elector-activity window: published topics
 * (optionally one host's — the elector table's OWN filter, independent of
 * the topics filter since QA 2026-07-27); hearts additionally post-cutoff
 * and post-activitySince. Elector activity starts at the explicit date, or
 * the hearts cutoff by default (QA #59 round 3). `baseTopicConds` is the
 * same window without the host narrowing, for the host-activity table. */
async function activityWindow(
  timetableId: string,
  opts: { activityHostId?: string; activitySince?: Date },
): Promise<{
  baseTopicConds: SQL[];
  activityTopicConds: SQL[];
  heartCountConds: SQL[];
  activitySince: Date | undefined;
}> {
  const baseTopicConds = [
    eq(topics.timetableId, timetableId),
    eq(topics.status, "published" as const),
  ];
  const activityTopicConds = [...baseTopicConds];
  if (opts.activityHostId) {
    activityTopicConds.push(eq(topics.hostId, opts.activityHostId));
  }

  const cutoff = await getHeartsCountFrom(timetableId);
  const activitySince = opts.activitySince ?? cutoff ?? undefined;
  const heartCountConds = [...activityTopicConds];
  if (cutoff) heartCountConds.push(gte(hearts.createdAt, cutoff));
  if (activitySince) {
    heartCountConds.push(gte(hearts.createdAt, activitySince));
  }

  return { baseTopicConds, activityTopicConds, heartCountConds, activitySince };
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
 * replaces three queries that shared the same WHERE clause. Host profile
 * fields come from the host's membership (per-forum profiles); the left
 * join keeps rows when the host has left the forum. */
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
      hostName: timetableMemberships.name,
      hostSlug: timetableMemberships.slug,
      createdAt: hearts.createdAt,
    })
    .from(hearts)
    .innerJoin(topics, eq(topics.id, hearts.topicId))
    .leftJoin(
      timetableMemberships,
      and(
        eq(timetableMemberships.userId, topics.hostId),
        eq(timetableMemberships.timetableId, topics.timetableId),
      ),
    )
    .where(and(...heartCountConds));
}

/** All 💙s on published topics, HeartActivityRow-shaped: `electorId` is
 * the GIVING host; topic fields describe the 💙'd topic and its owner.
 * No cutoff/window — 💙s ignore heartsCountFrom (host hearts,
 * 2026-08-04). Feeds the leaderboard 💙 norms, the given-counts, and the
 * host rows' fold-open topic lists. */
async function loadHostHeartActivity(
  timetableId: string,
): Promise<HeartActivityRow[]> {
  return db
    .select({
      electorId: hostHearts.userId,
      topicId: topics.id,
      title: topics.title,
      slug: topics.slug,
      hostId: topics.hostId,
      hostName: timetableMemberships.name,
      hostSlug: timetableMemberships.slug,
      createdAt: hostHearts.createdAt,
    })
    .from(hostHearts)
    .innerJoin(topics, eq(topics.id, hostHearts.topicId))
    .leftJoin(
      timetableMemberships,
      and(
        eq(timetableMemberships.userId, topics.hostId),
        eq(timetableMemberships.timetableId, topics.timetableId),
      ),
    )
    .where(
      and(
        eq(topics.timetableId, timetableId),
        eq(topics.status, "published" as const),
      ),
    );
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

/** Per-elector hearted topics for the per-row disclosure — same cutoff/
 * filter as the heart counts, with the host and the elector's own comment
 * count on each topic attached for the sortable sub-table. */
function heartedTopicsByElector(
  heartActivityRows: HeartActivityRow[],
  commentsByElectorTopic: Map<string, number>,
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
      commentCount:
        commentsByElectorTopic.get(`${r.electorId}:${r.topicId}`) ?? 0,
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

/** Public, non-hidden comments per elector inside the activity window,
 * counted per topic — the per-elector totals and the per-topic counts for
 * the hearted-topics sub-table both derive from one grouped query. */
async function loadCommentActivity(
  activityTopicConds: SQL[],
  activitySince: Date | undefined,
): Promise<{
  byElector: Map<string, Stat>;
  byElectorTopic: Map<string, number>;
}> {
  const commentRows = await db
    .select({
      electorId: comments.authorId,
      topicId: comments.topicId,
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
        isNull(comments.deletedAt),
        ...(activitySince ? [gte(comments.createdAt, activitySince)] : []),
      ),
    )
    .groupBy(comments.authorId, comments.topicId);
  const byElector = new Map<string, Stat>();
  const byElectorTopic = new Map<string, number>();
  for (const r of commentRows) {
    const cur = byElector.get(r.electorId) ?? { count: 0, latestAt: null };
    cur.count += r.count;
    cur.latestAt = latestDate(cur.latestAt, r.latestAt);
    byElector.set(r.electorId, cur);
    byElectorTopic.set(`${r.electorId}:${r.topicId}`, r.count);
  }
  return { byElector, byElectorTopic };
}

/** Per-(elector, topic) public comment tallies feeding the 💬 metrics:
 * elector-authored only (electors drive metrics — QA 2026-07-27), never the
 * topic's own host, published topics, inside the activity window. Always
 * forum-wide — the host filter never shrinks a commenter's denominator. */
async function loadCommentTallies(
  timetableId: string,
  activitySince: Date | undefined,
): Promise<CommentTally[]> {
  return db
    .select({
      topicId: comments.topicId,
      userId: comments.authorId,
      count: sql<number>`count(*)::int`,
    })
    .from(comments)
    .innerJoin(topics, eq(topics.id, comments.topicId))
    .innerJoin(
      timetableMemberships,
      and(
        eq(timetableMemberships.userId, comments.authorId),
        eq(timetableMemberships.timetableId, timetableId),
      ),
    )
    .where(
      and(
        eq(topics.timetableId, timetableId),
        eq(topics.status, "published" as const),
        eq(comments.visibility, "public" as const),
        isNull(comments.hiddenAt),
        isNull(comments.deletedAt),
        sql`'elector' = ANY(${timetableMemberships.roles})`,
        ne(comments.authorId, topics.hostId),
        ...(activitySince ? [gte(comments.createdAt, activitySince)] : []),
      ),
    )
    .groupBy(comments.topicId, comments.authorId);
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
  electorRows: { userId: string; name: string | null; image: string | null }[];
  heartActivityRows: HeartActivityRow[];
  commentsByElector: Map<string, Stat>;
  commentsByElectorTopic: Map<string, number>;
  availabilityByElector: Map<string, Stat>;
  queueCoverage: { publishedCount: number; coveredByUser: Map<string, number> };
  filter: ElectorActivityFilter;
}): DashboardData["electorActivity"] {
  const heartsByElector = heartStatsByElector(args.heartActivityRows);
  const heartedByElector = heartedTopicsByElector(
    args.heartActivityRows,
    args.commentsByElectorTopic,
  );

  return args.electorRows
    .map((elector) => {
      const heartStat = heartsByElector.get(elector.userId);
      const commentStat = args.commentsByElector.get(elector.userId);
      const availabilityStat = args.availabilityByElector.get(elector.userId);
      return {
        electorId: elector.userId,
        electorName: elector.name,
        electorImage: elector.image,
        heartCount: heartStat?.count ?? 0,
        commentCount: commentStat?.count ?? 0,
        availabilityCount: availabilityStat?.count ?? 0,
        queueCount:
          args.queueCoverage.publishedCount -
          (args.queueCoverage.coveredByUser.get(elector.userId) ?? 0),
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

/** Published topics with no session pencilled into any slot. (Bookings
 * model 2026-08-06: sessions live in slot_sessions, several per slot;
 * competing claims are conversation, not data.) */
async function findUnallocated(
  timetableId: string,
  feed: FeedTopic[],
): Promise<DashboardData["unallocatedTopics"]> {
  const tagRows = await db
    .select({ topicId: slotSessions.topicId })
    .from(slotSessions)
    .innerJoin(timeslots, eq(timeslots.id, slotSessions.slotId))
    .where(eq(timeslots.timetableId, timetableId));
  const taggedTopicIds = new Set(
    tagRows.map((r) => r.topicId).filter((id): id is string => id !== null),
  );
  return feed
    .filter((t) => !taggedTopicIds.has(t.id))
    .map((t) => ({
      id: t.id,
      title: t.title,
      slug: t.slug,
      hostSlug: t.hostSlug,
    }));
}

export async function getDashboard(
  timetableId: string,
  opts: {
    /** Narrows the topic leaderboard (and slot data) to one host. */
    hostId?: string;
    /** Narrows the elector-activity table to activity on one host's topics —
     * independent of `hostId` since QA 2026-07-27 (per-table filters). The
     * host-activity table is never narrowed. */
    activityHostId?: string;
    electorActivity?: ElectorActivityFilter;
    /** Only count elector activity on/after this date (QA #59 round 3);
     * the UI defaults it to the hearts cutoff. */
    activitySince?: Date;
  } = {},
): Promise<DashboardData> {
  const topicCounts = await countTopicsByStatus(timetableId, opts.hostId);
  const { electorRows, hostRows } = await loadMembers(timetableId);
  const electorCount = electorRows.length;
  const hostCount = hostRows.length;

  // Weighted feed gives published topics with scores + host names.
  const feed = await buildFeed(timetableId, null, {
    hostId: opts.hostId,
    sort: "hearts",
  });
  const totalHearts = feed.reduce((sum, t) => sum + t.heartCount, 0);

  const { baseTopicConds, activityTopicConds, heartCountConds, activitySince } =
    await activityWindow(timetableId, opts);

  const commentTallies = await loadCommentTallies(timetableId, activitySince);
  // 💙s ignore the activity window and cutoff — they aren't votes; the
  // admin table shows the standing picture.
  const hostHeartRows = await loadHostHeartActivity(timetableId);
  const topicLeaderboard = buildLeaderboards(
    feed,
    topicCommentScores(commentTallies),
    computeHostHeartScores(hostHeartRows),
  );

  const heartActivityRows = await loadHeartActivity(heartCountConds);

  const commentActivity = await loadCommentActivity(
    activityTopicConds,
    activitySince,
  );
  // The host table ignores both host filters — recount unfiltered when the
  // elector table's filter would otherwise shrink hosts' comment stats.
  const hostCommentActivity = opts.activityHostId
    ? await loadCommentActivity(baseTopicConds, activitySince)
    : commentActivity;
  const availabilityByElector = await loadAvailabilityActivity(
    timetableId,
    activitySince,
  );

  const electorActivity = buildElectorActivity({
    electorRows,
    heartActivityRows,
    commentsByElector: commentActivity.byElector,
    commentsByElectorTopic: commentActivity.byElectorTopic,
    availabilityByElector,
    queueCoverage: await loadQueueCoverage(
      timetableId,
      await getHeartsCountFrom(timetableId),
    ),
    filter: opts.electorActivity ?? "all",
  });

  const hostActivity = buildHostActivity({
    hostRows,
    topicStats: await loadHostTopicStats(timetableId),
    commentsByAuthor: hostCommentActivity.byElector,
    hostHeartRows,
    commentsByAuthorTopic: hostCommentActivity.byElectorTopic,
  });

  const unallocatedTopics = await findUnallocated(timetableId, feed);

  return {
    topicCounts,
    totalHearts,
    electorCount,
    hostCount,
    topicLeaderboard,
    hostActivity,
    electorActivity,
    unallocatedTopics,
  };
}
