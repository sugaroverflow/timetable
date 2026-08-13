import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";

import type { MembershipDigestSettings } from "@timetable/shared";

import {
  db,
  timetableMemberships,
  users,
  type NotificationSettings,
  type TimetableMembership,
  type User,
} from "@timetable/db";

import { ensureMemberSlug } from "./slugs";

/** Return the user's ICS subscription token, creating one on first use. */
export async function getOrCreateIcsToken(
  userId: string,
): Promise<string | null> {
  const [user] = await db
    .select({ icsToken: users.icsToken })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user) return null;
  if (user.icsToken) return user.icsToken;
  const token = randomUUID();
  await db.update(users).set({ icsToken: token }).where(eq(users.id, userId));
  return token;
}

export async function getUserByIcsToken(token: string): Promise<User | null> {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.icsToken, token))
    .limit(1);
  return user ?? null;
}

/** Update a member's per-forum profile (2026-07: name/photo/bio/slug are
 * forum-scoped; only the account itself — email, auth — stays global).
 * The slug follows renames within this forum only. */
export async function updateMemberProfile(
  timetableId: string,
  userId: string,
  patch: { name?: string; bio?: string | null; image?: string | null },
): Promise<TimetableMembership | null> {
  const [membership] = await db
    .select({ id: timetableMemberships.id })
    .from(timetableMemberships)
    .where(
      and(
        eq(timetableMemberships.timetableId, timetableId),
        eq(timetableMemberships.userId, userId),
      ),
    )
    .limit(1);
  if (!membership) return null;

  const slug =
    patch.name !== undefined
      ? await ensureMemberSlug(timetableId, patch.name, {
          excludeMembershipId: membership.id,
        })
      : undefined;
  const [updated] = await db
    .update(timetableMemberships)
    .set({
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(slug !== undefined ? { slug } : {}),
      ...(patch.bio !== undefined ? { bio: patch.bio } : {}),
      ...(patch.image !== undefined ? { image: patch.image } : {}),
      updatedAt: new Date(),
    })
    .where(eq(timetableMemberships.id, membership.id))
    .returning();
  return updated ?? null;
}

export async function getUserNotificationSettings(
  userId: string,
): Promise<NotificationSettings> {
  const [user] = await db
    .select({ notificationSettings: users.notificationSettings })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return user?.notificationSettings ?? {};
}

export async function updateUserNotificationSettings(
  userId: string,
  patch: Partial<NotificationSettings>,
): Promise<User | null> {
  const current = await getUserNotificationSettings(userId);
  const merged: NotificationSettings = { ...current, ...patch };
  const [user] = await db
    .update(users)
    .set({ notificationSettings: merged })
    .where(eq(users.id, userId))
    .returning();
  return user ?? null;
}

/** The member's per-forum digest settings ({} = all fallbacks). */
export async function getMembershipDigestSettings(
  timetableId: string,
  userId: string,
): Promise<MembershipDigestSettings> {
  const [membership] = await db
    .select({ digestSettings: timetableMemberships.digestSettings })
    .from(timetableMemberships)
    .where(
      and(
        eq(timetableMemberships.timetableId, timetableId),
        eq(timetableMemberships.userId, userId),
      ),
    )
    .limit(1);
  return membership?.digestSettings ?? {};
}

/** Patch the member's per-forum digest settings (2026-08-11): provided
 * fields overwrite, absent fields keep their stored value ({} clears
 * nothing). */
export async function updateMembershipDigestSettings(
  timetableId: string,
  userId: string,
  patch: MembershipDigestSettings,
): Promise<boolean> {
  const current = await getMembershipDigestSettings(timetableId, userId);
  const [updated] = await db
    .update(timetableMemberships)
    .set({ digestSettings: { ...current, ...patch }, updatedAt: new Date() })
    .where(
      and(
        eq(timetableMemberships.timetableId, timetableId),
        eq(timetableMemberships.userId, userId),
      ),
    )
    .returning({ id: timetableMemberships.id });
  return Boolean(updated);
}
