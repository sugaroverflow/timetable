import { and, eq, type SQL } from "drizzle-orm";

import {
  db,
  timetableMemberships,
  timetables,
  topics,
  users,
  type Timetable,
  type TimetableMembership,
} from "@timetable/db";
import type { Role } from "@timetable/shared";

import { logActivity } from "./activity";
import { ensureMemberSlug } from "./slugs";
import { unpublishTopic } from "./topics";

/** Create a membership with its per-forum profile seeded from the account's
 * (Clerk-synced) defaults. Every membership-creation path goes through this
 * so name/image/slug are always initialized. */
export async function createMembershipWithProfile(args: {
  userId: string;
  timetableId: string;
  roles: Role[];
}): Promise<void> {
  const [account] = await db
    .select({ name: users.name, image: users.image })
    .from(users)
    .where(eq(users.id, args.userId))
    .limit(1);
  const slug = await ensureMemberSlug(args.timetableId, account?.name ?? null);
  // Concurrent first-sign-in paths (JIT claim + REST claim) can race to
  // create the same membership; the (userId, timetableId) unique makes the
  // loser a no-op instead of a 500 (audit 2026-08-17).
  await db
    .insert(timetableMemberships)
    .values({
      userId: args.userId,
      timetableId: args.timetableId,
      roles: args.roles,
      name: account?.name ?? null,
      image: account?.image ?? null,
      slug,
    })
    .onConflictDoNothing({
      target: [timetableMemberships.userId, timetableMemberships.timetableId],
    });
}

export async function getMembershipById(
  id: string,
): Promise<TimetableMembership | null> {
  const [membership] = await db
    .select()
    .from(timetableMemberships)
    .where(eq(timetableMemberships.id, id))
    .limit(1);
  return membership ?? null;
}

export async function getUserById(id: string): Promise<{
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
} | null> {
  const [user] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      image: users.image,
    })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  return user ?? null;
}

export async function getTimetableById(id: string): Promise<Timetable | null> {
  const [timetable] = await db
    .select()
    .from(timetables)
    .where(eq(timetables.id, id))
    .limit(1);
  return timetable ?? null;
}

export async function setMemberRoles(
  membershipId: string,
  roles: Role[],
): Promise<TimetableMembership | null> {
  const [updated] = await db
    .update(timetableMemberships)
    .set({ roles, updatedAt: new Date() })
    .where(eq(timetableMemberships.id, membershipId))
    .returning();
  return updated ?? null;
}

export type MemberWithUser = {
  membershipId: string;
  roles: Role[];
  /** When the invite email was last sent; null = never invited (round 2). */
  inviteSentAt: Date | null;
  /** Set while deactivated (member-deactivation, 2026-09-10). */
  deactivatedAt: Date | null;
  user: {
    id: string;
    name: string | null;
    email: string | null;
    image: string | null;
  };
};

export async function listTimetableHosts(
  timetableId: string,
): Promise<{ id: string; name: string | null }[]> {
  const members = await listMembers(timetableId);
  return (
    members
      // Deactivated hosts aren't offered as topic owners.
      .filter((m) => m.roles.includes("host") && !m.deactivatedAt)
      .map((m) => ({ id: m.user.id, name: m.user.name }))
      .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""))
  );
}

export async function listMembers(
  timetableId: string,
): Promise<MemberWithUser[]> {
  const rows = await db
    .select({
      membershipId: timetableMemberships.id,
      roles: timetableMemberships.roles,
      inviteSentAt: timetableMemberships.inviteSentAt,
      deactivatedAt: timetableMemberships.deactivatedAt,
      userId: users.id,
      name: timetableMemberships.name,
      email: users.email,
      image: timetableMemberships.image,
    })
    .from(timetableMemberships)
    .innerJoin(users, eq(users.id, timetableMemberships.userId))
    .where(eq(timetableMemberships.timetableId, timetableId));

  return rows.map((r) => ({
    membershipId: r.membershipId,
    roles: r.roles,
    inviteSentAt: r.inviteSentAt,
    deactivatedAt: r.deactivatedAt,
    user: { id: r.userId, name: r.name, email: r.email, image: r.image },
  }));
}

/** The viewer's feed watermark for the "new since last visit" highlight. */
export async function getFeedLastSeen(
  userId: string,
  timetableId: string,
): Promise<Date | null> {
  const [row] = await db
    .select({ lastSeenFeedAt: timetableMemberships.lastSeenFeedAt })
    .from(timetableMemberships)
    .where(
      and(
        eq(timetableMemberships.userId, userId),
        eq(timetableMemberships.timetableId, timetableId),
      ),
    )
    .limit(1);
  return row?.lastSeenFeedAt ?? null;
}

/** Bumps the viewer's feed watermark to now. No-op for non-members. */
export async function markFeedSeen(
  userId: string,
  timetableId: string,
): Promise<void> {
  await db
    .update(timetableMemberships)
    .set({ lastSeenFeedAt: new Date() })
    .where(
      and(
        eq(timetableMemberships.userId, userId),
        eq(timetableMemberships.timetableId, timetableId),
      ),
    );
}

/** Remove a member from a timetable (QA #59 round 3 — People page).
 * The caller guards admin permission and owner protection. */
export async function removeMembership(
  membership: TimetableMembership,
  actorId: string,
): Promise<void> {
  await db
    .delete(timetableMemberships)
    .where(eq(timetableMemberships.id, membership.id));
  await logActivity({
    timetableId: membership.timetableId,
    actorId,
    action: "member.remove",
    payload: {
      removedUserId: membership.userId,
      removedName: membership.name ?? null,
      roles: membership.roles,
    },
  });
}

/** Deactivate a member (member-deactivation — Ed, 2026-09-10): the
 * reversible alternative to removal for someone who has left. The
 * membership row stays, so their comments keep their byline and their
 * topics their host profile; what changes is that their roles resolve as
 * none (getViewerRoles), they leave the People page and the host picker,
 * their digests pause, and every topic of theirs that is currently live
 * comes down through the ordinary unpublish path — one `topic.unpublish`
 * line per topic in the log, under the admin's name, so each takedown is
 * as visible as a manual one. Drafts and already-unpublished topics are
 * left alone. Idempotent: a second call on a deactivated member does
 * nothing. The caller guards admin permission, owner and self. */
export async function deactivateMembership(
  membership: TimetableMembership,
  actorId: string,
): Promise<{ unpublishedCount: number }> {
  if (membership.deactivatedAt) return { unpublishedCount: 0 };

  const live = await db
    .select()
    .from(topics)
    .where(
      and(
        eq(topics.timetableId, membership.timetableId),
        eq(topics.hostId, membership.userId),
        eq(topics.status, "published"),
      ),
    );
  for (const topic of live) {
    await unpublishTopic(topic, actorId);
  }

  await db
    .update(timetableMemberships)
    .set({ deactivatedAt: new Date(), updatedAt: new Date() })
    .where(eq(timetableMemberships.id, membership.id));
  await logActivity({
    timetableId: membership.timetableId,
    actorId,
    action: "member.deactivate",
    payload: {
      targetUserId: membership.userId,
      targetName: membership.name ?? null,
      targetRoles: membership.roles,
      unpublishedTopicIds: live.map((t) => t.id),
    },
    note:
      live.length > 0
        ? `${live.length} published ${live.length === 1 ? "topic" : "topics"} unpublished`
        : null,
  });
  return { unpublishedCount: live.length };
}

/** Reactivate a deactivated member: their stored roles come back into
 * force and they return to the People page. Topics are NOT republished —
 * whether a topic that was live when they left should be live again is an
 * editorial call, and Publish exists for it. The digest watermark is
 * stamped to now so their first digest back covers what happened since
 * they returned, not the whole absence (a paused membership's watermark
 * never advanced). Idempotent on an active member. */
export async function reactivateMembership(
  membership: TimetableMembership,
  actorId: string,
): Promise<void> {
  if (!membership.deactivatedAt) return;
  const now = new Date();
  await db
    .update(timetableMemberships)
    .set({ deactivatedAt: null, lastDigestAt: now, updatedAt: now })
    .where(eq(timetableMemberships.id, membership.id));
  await logActivity({
    timetableId: membership.timetableId,
    actorId,
    action: "member.reactivate",
    payload: {
      targetUserId: membership.userId,
      targetName: membership.name ?? null,
      targetRoles: membership.roles,
    },
  });
}

export type PersonTopic = {
  id: string;
  title: string;
  slug: string | null;
};

export type Person = {
  userId: string;
  name: string | null;
  image: string | null;
  slug: string | null;
  bio: string | null;
  roles: Role[];
  /** Set while deactivated (member-deactivation, 2026-09-10). The API
   * hides deactivated people from non-admin viewers; admins get them with
   * the stamp so the People page can list them apart and offer
   * reactivation. */
  deactivatedAt: Date | null;
  publishedTopics?: PersonTopic[];
};

/** Members with their public profile fields (no emails) — powers the
 * People page and person pages. Caller gates on timetable readability.
 * Each person carries their published topics (QA #59 — host cards list
 * topic titles). */
export async function listPeople(timetableId: string): Promise<Person[]> {
  const rows = await db
    .select({
      userId: users.id,
      name: timetableMemberships.name,
      image: timetableMemberships.image,
      slug: timetableMemberships.slug,
      bio: timetableMemberships.bio,
      roles: timetableMemberships.roles,
      deactivatedAt: timetableMemberships.deactivatedAt,
    })
    .from(timetableMemberships)
    .innerJoin(users, eq(users.id, timetableMemberships.userId))
    .where(eq(timetableMemberships.timetableId, timetableId));

  const published = await db
    .select({
      id: topics.id,
      title: topics.title,
      slug: topics.slug,
      hostId: topics.hostId,
    })
    .from(topics)
    .where(
      and(eq(topics.timetableId, timetableId), eq(topics.status, "published")),
    )
    .orderBy(topics.title);
  const byHost = new Map<string, PersonTopic[]>();
  for (const t of published) {
    const list = byHost.get(t.hostId) ?? [];
    list.push({ id: t.id, title: t.title, slug: t.slug });
    byHost.set(t.hostId, list);
  }

  return rows
    .map((row) => ({ ...row, publishedTopics: byHost.get(row.userId) ?? [] }))
    .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
}

/** One member's public profile (person pages / profile editor). */
export async function getPerson(
  timetableId: string,
  userId: string,
): Promise<Person | null> {
  return getPersonWhere(timetableId, eq(timetableMemberships.userId, userId));
}

/** One member's public profile, resolved by their user slug (person pages —
 * /f/[slug]/[userSlug]). Slugs are globally unique; the membership join
 * scopes the hit to this timetable. */
export async function getPersonBySlug(
  timetableId: string,
  userSlug: string,
): Promise<Person | null> {
  return getPersonWhere(timetableId, eq(timetableMemberships.slug, userSlug));
}

async function getPersonWhere(
  timetableId: string,
  cond: SQL,
): Promise<Person | null> {
  const [row] = await db
    .select({
      userId: users.id,
      name: timetableMemberships.name,
      image: timetableMemberships.image,
      slug: timetableMemberships.slug,
      bio: timetableMemberships.bio,
      roles: timetableMemberships.roles,
      deactivatedAt: timetableMemberships.deactivatedAt,
    })
    .from(timetableMemberships)
    .innerJoin(users, eq(users.id, timetableMemberships.userId))
    .where(and(eq(timetableMemberships.timetableId, timetableId), cond))
    .limit(1);
  return row ?? null;
}
