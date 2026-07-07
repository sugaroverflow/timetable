import { and, desc, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { activityEvents, db, topics, users } from "@timetable/db";

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
  /** Resolved from payload.topicId so the timeline can link the topic. */
  topicSlug: string | null;
  topicHostSlug: string | null;
};

export async function listActivity(
  timetableId: string,
  opts: { actorId?: string; limit?: number } = {},
): Promise<ActivityEntry[]> {
  const hostUsers = alias(users, "host_users");
  const conds = [eq(activityEvents.timetableId, timetableId)];
  if (opts.actorId) conds.push(eq(activityEvents.actorId, opts.actorId));

  const rows = await db
    .select({
      id: activityEvents.id,
      action: activityEvents.action,
      payload: activityEvents.payload,
      note: activityEvents.note,
      createdAt: activityEvents.createdAt,
      actorId: activityEvents.actorId,
      actorName: users.name,
      topicSlug: topics.slug,
      topicHostSlug: hostUsers.slug,
    })
    .from(activityEvents)
    .leftJoin(users, eq(users.id, activityEvents.actorId))
    .leftJoin(
      topics,
      sql`${topics.id}::text = ${activityEvents.payload}->>'topicId'`,
    )
    .leftJoin(hostUsers, eq(hostUsers.id, topics.hostId))
    .where(and(...conds))
    .orderBy(desc(activityEvents.createdAt))
    .limit(opts.limit ?? 100);

  return rows.map((r) => ({
    id: r.id,
    action: r.action,
    payload: r.payload,
    note: r.note,
    createdAt: r.createdAt,
    actorId: r.actorId,
    actorName: r.actorName,
    topicSlug: r.topicSlug,
    topicHostSlug: r.topicHostSlug,
  }));
}
