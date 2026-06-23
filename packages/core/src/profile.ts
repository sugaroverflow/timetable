import { eq } from "drizzle-orm";

import {
  db,
  users,
  type NotificationSettings,
  type User,
} from "@timetable/db";

export async function getUserProfile(userId: string): Promise<User | null> {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return user ?? null;
}

export async function updateUserProfile(
  userId: string,
  patch: { name?: string; bio?: string | null; image?: string | null },
): Promise<User | null> {
  const [user] = await db
    .update(users)
    .set({
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.bio !== undefined ? { bio: patch.bio } : {}),
      ...(patch.image !== undefined ? { image: patch.image } : {}),
    })
    .where(eq(users.id, userId))
    .returning();
  return user ?? null;
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
