import { and, asc, eq, inArray, sql } from "drizzle-orm";
import {
  db,
  pushSubscriptions,
  timetableMemberships,
  topics,
} from "@timetable/db";
import { isCalendarEnabled, pushTopicCandidates } from "@timetable/shared";
import { getReadableTimetable } from "./timetables";
import { listNotifications } from "./notifications";

export async function pushMembership(userId: string, slug: string) {
  const readable = await getReadableTimetable(userId, slug);
  if (!readable || readable.roles.length === 0) return null;
  const [member] = await db
    .select()
    .from(timetableMemberships)
    .where(
      and(
        eq(timetableMemberships.userId, userId),
        eq(timetableMemberships.timetableId, readable.timetable.id),
      ),
    );
  return member && !member.deactivatedAt ? member : null;
}

/** Endpoint ownership is serialized across accounts and forums. Never silently
 * reassign a shared browser's subscription to a different signed-in account. */
export async function managePush(
  userId: string,
  slug: string,
  endpoint: string,
  action: "enable" | "disable" | "status",
) {
  const member = await pushMembership(userId, slug);
  if (!member) return { status: 403, enabled: false };
  return db
    .transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${endpoint}))`,
      );
      const owned = await tx
        .select({ userId: timetableMemberships.userId })
        .from(pushSubscriptions)
        .innerJoin(
          timetableMemberships,
          eq(timetableMemberships.id, pushSubscriptions.membershipId),
        )
        .where(eq(pushSubscriptions.endpoint, endpoint));
      if (owned.some((row) => row.userId !== userId))
        return { status: 409, enabled: false };
      const where = and(
        eq(pushSubscriptions.membershipId, member.id),
        eq(pushSubscriptions.endpoint, endpoint),
      );
      if (action === "disable") await tx.delete(pushSubscriptions).where(where);
      if (action === "enable") {
        // Serialize the device cap too, including requests with different endpoints.
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtext(${member.id}))`,
        );
        const existing = await tx
          .select()
          .from(pushSubscriptions)
          .where(eq(pushSubscriptions.membershipId, member.id));
        if (
          existing.length >= 10 &&
          !existing.some((row) => row.endpoint === endpoint)
        )
          return { status: 429, enabled: false };
        await tx
          .insert(pushSubscriptions)
          .values({ membershipId: member.id, endpoint })
          .onConflictDoNothing();
      }
      const rows = await tx
        .select({ id: pushSubscriptions.id })
        .from(pushSubscriptions)
        .where(where);
      return { status: 200, enabled: rows.length > 0 };
    })
    .catch(() => {
      // Drizzle errors can embed query parameters, including the endpoint capability.
      throw new Error("Push subscription operation failed");
    });
}

/** Coalesced, best-effort alerts for public comments and session events only.
 * Recheck membership and topic publication immediately before each delivery.
 * Private threads/drafts are deliberately excluded from this first slice. */
export async function deliverPush(
  send: (endpoint: string) => Promise<"sent" | "gone" | "retry">,
) {
  const batch = await db
    .select({ id: pushSubscriptions.id })
    .from(pushSubscriptions)
    .orderBy(asc(pushSubscriptions.lastAttemptAt))
    .limit(20);
  const results = { sent: 0, gone: 0, retry: 0, skipped: 0 };
  for (const candidate of batch) {
    const result = await deliverOne(candidate.id, send);
    results[result]++;
  }
  return results;
}

type PushOutcome = "sent" | "gone" | "retry" | "skipped";

async function deliverOne(
  id: string,
  send: (endpoint: string) => Promise<"sent" | "gone" | "retry">,
): Promise<PushOutcome> {
  return db.transaction(async (tx) => {
    const [subscription] = await tx
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.id, id))
      .for("update", { skipLocked: true });
    if (!subscription) return "skipped" as const;
    const now = new Date();
    const [member] = await tx
      .select()
      .from(timetableMemberships)
      .where(eq(timetableMemberships.id, subscription.membershipId));
    if (!member || member.deactivatedAt) {
      await tx.delete(pushSubscriptions).where(eq(pushSubscriptions.id, id));
      return "gone" as const;
    }
    const readable = await getReadableTimetable(
      member.userId,
      member.timetableId,
    );
    let pending = false;
    if (readable && readable.roles.length > 0) {
      const notifications = await listNotifications(
        member.timetableId,
        member.userId,
      );
      const since = Math.max(
        subscription.lastCheckedAt.getTime(),
        member.lastSeenNotificationsAt?.getTime() ?? 0,
      );
      const eligible = pushTopicCandidates(
        notifications,
        new Date(since),
        now,
        isCalendarEnabled(readable.timetable.settings),
      );
      if (eligible.length > 0) {
        const published = await tx
          .select({ id: topics.id })
          .from(topics)
          .where(
            and(
              eq(topics.timetableId, member.timetableId),
              eq(topics.status, "published"),
              inArray(topics.id, eligible),
            ),
          );
        pending = published.length > 0;
      }
    }
    const outcome = pending ? await send(subscription.endpoint) : "skipped";
    if (outcome === "gone") {
      await tx.delete(pushSubscriptions).where(eq(pushSubscriptions.id, id));
    } else {
      await tx
        .update(pushSubscriptions)
        .set({
          lastAttemptAt: now,
          ...(outcome === "retry" ? {} : { lastCheckedAt: now }),
        })
        .where(eq(pushSubscriptions.id, id));
    }
    return outcome;
  });
}
