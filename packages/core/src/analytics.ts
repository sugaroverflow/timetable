import { and, eq, sql } from "drizzle-orm";

import {
  db,
  slotTopics,
  timeslots,
  timetableMemberships,
  topics,
  type TopicStatus,
} from "@timetable/db";

import { buildFeed } from "./topics";

export type DashboardData = {
  topicCounts: Record<TopicStatus, number>;
  totalHearts: number;
  electorCount: number;
  hostCount: number;
  slotCount: number;
  topicLeaderboard: {
    id: string;
    title: string;
    hostName: string | null;
    weightedScore: number;
    heartCount: number;
  }[];
  hostLeaderboard: {
    hostId: string;
    hostName: string | null;
    weightedScore: number;
  }[];
  unallocatedTopics: { id: string; title: string }[];
  conflicts: {
    slotId: string;
    startsAt: Date;
    location: string;
    topics: { id: string; title: string }[];
  }[];
};

export async function getDashboard(timetableId: string): Promise<DashboardData> {
  const emptyCounts: Record<TopicStatus, number> = {
    draft: 0,
    submitted: 0,
    published: 0,
    unpublished: 0,
    archived: 0,
  };

  const statusRows = await db
    .select({ status: topics.status, n: sql<number>`count(*)::int` })
    .from(topics)
    .where(eq(topics.timetableId, timetableId))
    .groupBy(topics.status);
  const topicCounts = { ...emptyCounts };
  for (const r of statusRows) topicCounts[r.status] = r.n;

  const memberRows = await db
    .select({ roles: timetableMemberships.roles })
    .from(timetableMemberships)
    .where(eq(timetableMemberships.timetableId, timetableId));
  const electorCount = memberRows.filter((m) =>
    m.roles.includes("elector"),
  ).length;
  const hostCount = memberRows.filter((m) => m.roles.includes("host")).length;

  const [{ n: slotCount } = { n: 0 }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(timeslots)
    .where(eq(timeslots.timetableId, timetableId));

  // Weighted feed gives published topics with scores + host names.
  const feed = await buildFeed(timetableId, null, { sort: "hearts" });
  const totalHearts = feed.reduce((sum, t) => sum + t.heartCount, 0);

  const topicLeaderboard = feed.slice(0, 10).map((t) => ({
    id: t.id,
    title: t.title,
    hostName: t.hostName,
    weightedScore: t.weightedScore,
    heartCount: t.heartCount,
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

  // Tagged topic ids (this timetable) -> unallocated = published not tagged.
  const tagRows = await db
    .select({
      slotId: slotTopics.slotId,
      topicId: slotTopics.topicId,
      title: topics.title,
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
    .map((t) => ({ id: t.id, title: t.title }));

  // Slots with more than one tagged topic = conflicts.
  const bySlot = new Map<
    string,
    {
      slotId: string;
      startsAt: Date;
      location: string;
      topics: { id: string; title: string }[];
    }
  >();
  for (const r of tagRows) {
    const entry =
      bySlot.get(r.slotId) ?? {
        slotId: r.slotId,
        startsAt: r.startsAt,
        location: r.location,
        topics: [],
      };
    entry.topics.push({ id: r.topicId, title: r.title });
    bySlot.set(r.slotId, entry);
  }
  const conflicts = Array.from(bySlot.values()).filter(
    (s) => s.topics.length > 1,
  );

  return {
    topicCounts,
    totalHearts,
    electorCount,
    hostCount,
    slotCount,
    topicLeaderboard,
    hostLeaderboard,
    unallocatedTopics,
    conflicts,
  };
}
