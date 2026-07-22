import { and, eq } from "drizzle-orm";

import { db, timetableMemberships, users } from "@timetable/db";

/**
 * Admin "add person" support (product feedback round 2): accounts are
 * pre-created and populated before the person is ever emailed, so joining
 * is just their first sign-in. The Clerk side lives in the API layer —
 * core only handles the local rows.
 */

export async function findUserByEmail(
  email: string,
): Promise<{ id: string; name: string | null } | null> {
  const [user] = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(eq(users.email, email.trim().toLowerCase()))
    .limit(1);
  return user ?? null;
}

/**
 * Insert the local row for a just-created Clerk user (id = Clerk user id).
 * Safe to call when the row already exists (first-request JIT creation may
 * have won a race) — the existing row wins.
 */
export async function createLocalUser(args: {
  id: string;
  email: string;
  name: string | null;
}): Promise<void> {
  await db
    .insert(users)
    .values({
      id: args.id,
      email: args.email.trim().toLowerCase(),
      name: args.name,
    })
    .onConflictDoNothing({ target: users.id });
}

/** Record that the invite email went out (also used for resends). */
export async function markInviteSent(
  membershipId: string,
  at: Date = new Date(),
): Promise<void> {
  await db
    .update(timetableMemberships)
    .set({ inviteSentAt: at, updatedAt: new Date() })
    .where(eq(timetableMemberships.id, membershipId));
}

/** The membership joining a timetable and user, if any. */
export async function getMembership(
  timetableId: string,
  userId: string,
): Promise<{ id: string; inviteSentAt: Date | null } | null> {
  const [m] = await db
    .select({
      id: timetableMemberships.id,
      inviteSentAt: timetableMemberships.inviteSentAt,
    })
    .from(timetableMemberships)
    .where(
      and(
        eq(timetableMemberships.timetableId, timetableId),
        eq(timetableMemberships.userId, userId),
      ),
    )
    .limit(1);
  return m ?? null;
}
