import { and, eq } from "drizzle-orm";

import {
  db,
  timetableMemberships,
  timetables,
  users,
  type Timetable,
  type TimetableMembership,
} from "@timetable/db";
import type { Role } from "@timetable/shared";

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
  return members
    .filter((m) => m.roles.includes("host"))
    .map((m) => ({ id: m.user.id, name: m.user.name }));
}

export async function listMembers(
  timetableId: string,
): Promise<MemberWithUser[]> {
  const rows = await db
    .select({
      membershipId: timetableMemberships.id,
      roles: timetableMemberships.roles,
      userId: users.id,
      name: users.name,
      email: users.email,
      image: users.image,
    })
    .from(timetableMemberships)
    .innerJoin(users, eq(users.id, timetableMemberships.userId))
    .where(eq(timetableMemberships.timetableId, timetableId));

  return rows.map((r) => ({
    membershipId: r.membershipId,
    roles: r.roles,
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

export type Person = {
  userId: string;
  name: string | null;
  image: string | null;
  slug: string | null;
  bio: string | null;
  roles: Role[];
};

/** Members with their public profile fields (no emails) — powers the
 * People page and the bio modal. Caller gates on timetable readability. */
export async function listPeople(timetableId: string): Promise<Person[]> {
  const rows = await db
    .select({
      userId: users.id,
      name: users.name,
      image: users.image,
      slug: users.slug,
      bio: users.bio,
      roles: timetableMemberships.roles,
    })
    .from(timetableMemberships)
    .innerJoin(users, eq(users.id, timetableMemberships.userId))
    .where(eq(timetableMemberships.timetableId, timetableId));
  return rows.sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
}

/** One member's public profile (for the bio modal). */
export async function getPerson(
  timetableId: string,
  userId: string,
): Promise<Person | null> {
  const [row] = await db
    .select({
      userId: users.id,
      name: users.name,
      image: users.image,
      slug: users.slug,
      bio: users.bio,
      roles: timetableMemberships.roles,
    })
    .from(timetableMemberships)
    .innerJoin(users, eq(users.id, timetableMemberships.userId))
    .where(
      and(
        eq(timetableMemberships.timetableId, timetableId),
        eq(timetableMemberships.userId, userId),
      ),
    )
    .limit(1);
  return row ?? null;
}
