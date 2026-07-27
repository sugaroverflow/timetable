import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";

import {
  db,
  timetableMemberships,
  timetables,
  topics,
  users,
  type User,
} from "@timetable/db";

/**
 * Cross-forum queries for the sysadmin dashboard (/admin). Sysadmin
 * identity is decided in the API layer (SYSADMIN_EMAILS env) — nothing
 * here checks permissions.
 */

export type SysadminForum = {
  id: string;
  slug: string;
  name: string;
  privacy: string;
  createdAt: Date;
  memberCount: number;
  /** Members who opened the forum's feed since `activeSince`. */
  activeMemberCount: number;
  topicCount: number;
  ownerName: string | null;
  ownerEmail: string | null;
};

export async function listAllForums(
  activeSince: Date,
): Promise<SysadminForum[]> {
  const rows = await db
    .select({
      id: timetables.id,
      slug: timetables.slug,
      name: timetables.name,
      privacy: timetables.privacy,
      createdAt: timetables.createdAt,
      ownerAccountName: users.name,
      ownerEmail: users.email,
      // The owner's per-forum display name, when their membership survives.
      ownerMemberName: timetableMemberships.name,
    })
    .from(timetables)
    .leftJoin(users, eq(users.id, timetables.ownerId))
    .leftJoin(
      timetableMemberships,
      and(
        eq(timetableMemberships.timetableId, timetables.id),
        eq(timetableMemberships.userId, timetables.ownerId),
      ),
    )
    .orderBy(desc(timetables.createdAt));

  const [memberCounts, activeCounts, topicCounts] = await Promise.all([
    db
      .select({
        timetableId: timetableMemberships.timetableId,
        count: sql<number>`count(*)::int`,
      })
      .from(timetableMemberships)
      .groupBy(timetableMemberships.timetableId),
    db
      .select({
        timetableId: timetableMemberships.timetableId,
        count: sql<number>`count(*)::int`,
      })
      .from(timetableMemberships)
      .where(gte(timetableMemberships.lastSeenFeedAt, activeSince))
      .groupBy(timetableMemberships.timetableId),
    db
      .select({
        timetableId: topics.timetableId,
        count: sql<number>`count(*)::int`,
      })
      .from(topics)
      .groupBy(topics.timetableId),
  ]);
  const byId = (list: { timetableId: string; count: number }[]) =>
    new Map(list.map((r) => [r.timetableId, r.count]));
  const members = byId(memberCounts);
  const active = byId(activeCounts);
  const topicTotals = byId(topicCounts);

  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    privacy: r.privacy,
    createdAt: r.createdAt,
    memberCount: members.get(r.id) ?? 0,
    activeMemberCount: active.get(r.id) ?? 0,
    topicCount: topicTotals.get(r.id) ?? 0,
    ownerName: r.ownerMemberName ?? r.ownerAccountName,
    ownerEmail: r.ownerEmail,
  }));
}

/** Hard delete: memberships, invites, topics (and their comments/hearts),
 * activity, and timeslots all cascade at the DB level. Returns the deleted
 * row, or null if it didn't exist. */
export async function deleteForum(timetableId: string) {
  const [deleted] = await db
    .delete(timetables)
    .where(eq(timetables.id, timetableId))
    .returning();
  return deleted ?? null;
}

/** The users behind a list of emails (case-insensitive) — used to find
 * which sysadmins opted into new-forum notification emails. */
export async function getUsersByEmails(emails: string[]): Promise<User[]> {
  if (emails.length === 0) return [];
  const lowered = emails.map((e) => e.toLowerCase());
  return db
    .select()
    .from(users)
    .where(inArray(sql`lower(${users.email})`, lowered));
}
