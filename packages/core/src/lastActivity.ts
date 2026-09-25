import { eq, sql, type AnyColumn } from "drizzle-orm";

import {
  activityEvents,
  availability,
  availabilityPatterns,
  commentSeen,
  comments,
  db,
  heartEvents,
  slotComments,
  slotSessions,
  timeslots,
  timetableMemberships,
  topics,
  topicSeen,
} from "@timetable/db";

import { coerceDate } from "./dates";

/**
 * last-activity-signals (Ed, 2026-09-25: "any sign we have that they're
 * active"): per member, the newest timestamp across EVERY trace the app
 * records of them doing something in this forum — the Analysis tables'
 * "Last activity".
 *
 * Acting: the activity log (their own actions — topic writes, slot and
 * calendar actions, queue finishes, first login, profile edits), the ❤️/💙
 * ledger (adds AND removes — the ledger, not the `hearts` table, whose
 * `createdAt` a cutoff revival bumps without anyone acting), comments and
 * slot-chat messages in any thread (posted or edited), availability,
 * pencils they created. Reading: Topic Queue showings, comment threads
 * read (which a digest click also stamps), All Topics and notifications
 * visits.
 *
 * Deliberately NOT windowed by the hearts cutoff: a date speaks for
 * itself, and a member last seen before term start should say so, not
 * show blank. Visible to everyone who sees the Analysis tables (hosts
 * included — Ed's call, 2026-09-25), so it does reveal 💙 and reading
 * timing to colleagues. Preview-as-member cannot pollute it: every
 * reading mark is a mutation, and mutations are refused while previewing.
 */
export async function loadLastActivitySignals(
  timetableId: string,
): Promise<Map<string, Date>> {
  // Posted or edited, whichever is later (greatest() skips a null edit).
  const latestOf = (edited: AnyColumn, created: AnyColumn) =>
    sql<Date | null>`max(greatest(${created}, ${edited}))`;

  const sources = await Promise.all([
    db
      .select({
        userId: activityEvents.actorId,
        at: sql<Date | null>`max(${activityEvents.createdAt})`,
      })
      .from(activityEvents)
      .where(eq(activityEvents.timetableId, timetableId))
      .groupBy(activityEvents.actorId),
    db
      .select({
        userId: heartEvents.userId,
        at: sql<Date | null>`max(${heartEvents.createdAt})`,
      })
      .from(heartEvents)
      .where(eq(heartEvents.timetableId, timetableId))
      .groupBy(heartEvents.userId),
    db
      .select({
        userId: comments.authorId,
        at: latestOf(comments.editedAt, comments.createdAt),
      })
      .from(comments)
      .innerJoin(topics, eq(topics.id, comments.topicId))
      .where(eq(topics.timetableId, timetableId))
      .groupBy(comments.authorId),
    db
      .select({
        userId: slotComments.authorId,
        at: latestOf(slotComments.editedAt, slotComments.createdAt),
      })
      .from(slotComments)
      .innerJoin(timeslots, eq(timeslots.id, slotComments.slotId))
      .where(eq(timeslots.timetableId, timetableId))
      .groupBy(slotComments.authorId),
    db
      .select({
        userId: availability.userId,
        at: sql<Date | null>`max(${availability.updatedAt})`,
      })
      .from(availability)
      .innerJoin(timeslots, eq(timeslots.id, availability.slotId))
      .where(eq(timeslots.timetableId, timetableId))
      .groupBy(availability.userId),
    db
      .select({
        userId: availabilityPatterns.userId,
        at: sql<Date | null>`max(${availabilityPatterns.updatedAt})`,
      })
      .from(availabilityPatterns)
      .where(eq(availabilityPatterns.timetableId, timetableId))
      .groupBy(availabilityPatterns.userId),
    db
      .select({
        userId: slotSessions.createdById,
        at: sql<Date | null>`max(${slotSessions.createdAt})`,
      })
      .from(slotSessions)
      .innerJoin(timeslots, eq(timeslots.id, slotSessions.slotId))
      .where(eq(timeslots.timetableId, timetableId))
      .groupBy(slotSessions.createdById),
    db
      .select({
        userId: topicSeen.userId,
        at: sql<Date | null>`max(${topicSeen.seenAt})`,
      })
      .from(topicSeen)
      .innerJoin(topics, eq(topics.id, topicSeen.topicId))
      .where(eq(topics.timetableId, timetableId))
      .groupBy(topicSeen.userId),
    db
      .select({
        userId: commentSeen.userId,
        at: sql<Date | null>`max(${commentSeen.seenAt})`,
      })
      .from(commentSeen)
      .innerJoin(topics, eq(topics.id, commentSeen.topicId))
      .where(eq(topics.timetableId, timetableId))
      .groupBy(commentSeen.userId),
    db
      .select({
        userId: timetableMemberships.userId,
        // greatest() skips nulls in Postgres.
        at: sql<Date | null>`greatest(${timetableMemberships.lastSeenFeedAt}, ${timetableMemberships.lastSeenNotificationsAt})`,
      })
      .from(timetableMemberships)
      .where(eq(timetableMemberships.timetableId, timetableId)),
  ]);

  const latest = new Map<string, Date>();
  for (const rows of sources) {
    for (const row of rows) {
      const at = coerceDate(row.at);
      if (!row.userId || !at) continue;
      const cur = latest.get(row.userId);
      if (!cur || at.getTime() > cur.getTime()) latest.set(row.userId, at);
    }
  }
  return latest;
}
