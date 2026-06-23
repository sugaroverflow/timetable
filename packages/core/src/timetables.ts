import { and, eq } from "drizzle-orm";

import {
  db,
  timetableMemberships,
  timetables,
  type Timetable,
} from "@timetable/db";
import {
  canReadTimetable,
  slugify,
  withRandomSuffix,
  type CreateTimetableInput,
  type Role,
} from "@timetable/shared";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function uniqueSlug(base: string): Promise<string> {
  let candidate = base;
  for (let attempt = 0; attempt < 6; attempt++) {
    const existing = await db
      .select({ id: timetables.id })
      .from(timetables)
      .where(eq(timetables.slug, candidate))
      .limit(1);
    if (existing.length === 0) return candidate;
    candidate = withRandomSuffix(base);
  }
  return withRandomSuffix(base);
}

/** Create a timetable and grant the creator owner + admin roles. */
export async function createTimetable(
  ownerId: string,
  input: CreateTimetableInput,
): Promise<Timetable> {
  const slug = await uniqueSlug(input.slug ?? slugify(input.name));

  const [timetable] = await db
    .insert(timetables)
    .values({
      name: input.name,
      slug,
      description: input.description ?? null,
      privacy: input.privacy ?? "private",
      ownerId,
    })
    .returning();

  if (!timetable) throw new Error("Failed to create timetable");

  await db.insert(timetableMemberships).values({
    userId: ownerId,
    timetableId: timetable.id,
    roles: ["owner", "admin"],
  });

  return timetable;
}

export type MembershipWithTimetable = {
  membershipId: string;
  roles: Role[];
  timetable: Timetable;
};

export async function listMembershipsForUser(
  userId: string,
): Promise<MembershipWithTimetable[]> {
  const rows = await db
    .select({
      membershipId: timetableMemberships.id,
      roles: timetableMemberships.roles,
      timetable: timetables,
    })
    .from(timetableMemberships)
    .innerJoin(timetables, eq(timetables.id, timetableMemberships.timetableId))
    .where(eq(timetableMemberships.userId, userId));

  return rows.map((r) => ({
    membershipId: r.membershipId,
    roles: r.roles,
    timetable: r.timetable,
  }));
}

export async function getViewerRoles(
  userId: string | null,
  timetableId: string,
): Promise<Role[]> {
  if (!userId) return [];
  const [membership] = await db
    .select({ roles: timetableMemberships.roles })
    .from(timetableMemberships)
    .where(
      and(
        eq(timetableMemberships.userId, userId),
        eq(timetableMemberships.timetableId, timetableId),
      ),
    )
    .limit(1);
  return membership?.roles ?? [];
}

export type ReadableTimetable = {
  timetable: Timetable;
  roles: Role[];
};

/** Load a timetable by id or slug, enforcing read access for the viewer. */
export async function getReadableTimetable(
  userId: string | null,
  idOrSlug: string,
): Promise<ReadableTimetable | null> {
  const [timetable] = await db
    .select()
    .from(timetables)
    .where(
      UUID_RE.test(idOrSlug)
        ? eq(timetables.id, idOrSlug)
        : eq(timetables.slug, idOrSlug),
    )
    .limit(1);

  if (!timetable) return null;

  const roles = await getViewerRoles(userId, timetable.id);
  if (!canReadTimetable(timetable.privacy, { userId, roles })) return null;

  return { timetable, roles };
}
