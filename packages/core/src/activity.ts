import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import {
  activityEvents,
  db,
  timetableMemberships,
  topics,
  users,
} from "@timetable/db";

export type ActivityInput = {
  timetableId: string;
  actorId: string | null;
  action: string;
  payload?: Record<string, unknown>;
  note?: string | null;
};

export async function logActivity(input: ActivityInput): Promise<void> {
  await db.insert(activityEvents).values({
    timetableId: input.timetableId,
    actorId: input.actorId,
    action: input.action,
    payload: input.payload ?? {},
    note: input.note ?? null,
  });
}

export type ActivityEntry = {
  id: string;
  action: string;
  payload: Record<string, unknown>;
  note: string | null;
  createdAt: Date;
  actorId: string | null;
  actorName: string | null;
  actorImage: string | null;
  /** The actor's roles in this timetable (QA #59 — shown on the log). */
  actorRoles: string[];
  /** Resolved from payload.topicId so the timeline can link the topic. */
  topicSlug: string | null;
  topicHostSlug: string | null;
  topicHostName: string | null;
};

export async function listActivity(
  timetableId: string,
  opts: {
    actorId?: string;
    from?: Date;
    to?: Date;
    limit?: number;
  } = {},
): Promise<ActivityEntry[]> {
  const hostUsers = alias(users, "host_users");
  const conds = [eq(activityEvents.timetableId, timetableId)];
  if (opts.actorId) conds.push(eq(activityEvents.actorId, opts.actorId));
  if (opts.from) conds.push(gte(activityEvents.createdAt, opts.from));
  if (opts.to) conds.push(lte(activityEvents.createdAt, opts.to));

  const rows = await db
    .select({
      id: activityEvents.id,
      action: activityEvents.action,
      payload: activityEvents.payload,
      note: activityEvents.note,
      createdAt: activityEvents.createdAt,
      actorId: activityEvents.actorId,
      actorName: users.name,
      actorImage: users.image,
      actorRoles: timetableMemberships.roles,
      topicSlug: topics.slug,
      topicHostSlug: hostUsers.slug,
      topicHostName: hostUsers.name,
    })
    .from(activityEvents)
    .leftJoin(users, eq(users.id, activityEvents.actorId))
    .leftJoin(
      timetableMemberships,
      and(
        eq(timetableMemberships.userId, activityEvents.actorId),
        eq(timetableMemberships.timetableId, activityEvents.timetableId),
      ),
    )
    .leftJoin(
      topics,
      sql`${topics.id}::text = ${activityEvents.payload}->>'topicId'`,
    )
    .leftJoin(hostUsers, eq(hostUsers.id, topics.hostId))
    .where(and(...conds))
    .orderBy(desc(activityEvents.createdAt))
    .limit(opts.limit ?? 200);

  return rows.map((r) => ({
    id: r.id,
    action: r.action,
    payload: r.payload,
    note: r.note,
    createdAt: r.createdAt,
    actorId: r.actorId,
    actorName: r.actorName,
    actorImage: r.actorImage,
    actorRoles: r.actorRoles ?? [],
    topicSlug: r.topicSlug,
    topicHostSlug: r.topicHostSlug,
    topicHostName: r.topicHostName,
  }));
}
