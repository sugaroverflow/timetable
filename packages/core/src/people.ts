import { and, eq } from "drizzle-orm";

import { db, timetableMemberships, users } from "@timetable/db";

import { claimInvitesForUser } from "./invites";

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
  const email = args.email.trim().toLowerCase();
  await db
    .insert(users)
    .values({ id: args.id, email, name: args.name })
    .onConflictDoNothing({ target: users.id });
  // Other forums may hold pending invites for this email (queued while no
  // account existed). Claim them now the row exists — the sign-in JIT claim
  // in the API only runs when IT creates the row, so it would skip this
  // pre-created account.
  await claimInvitesForUser(args.id, email);
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
