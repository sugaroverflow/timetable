import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";

import {
  db,
  timetableInvites,
  timetableMemberships,
  timetables,
  users,
} from "@timetable/db";
import type { AssignableRole, Role } from "@timetable/shared";

export type InviteOutcome = {
  email: string;
  status: "added" | "membership_updated" | "invited";
};

const INVITE_TTL_DAYS = 30;

function mergeRoles(existing: readonly Role[], incoming: readonly Role[]): Role[] {
  return Array.from(new Set<Role>([...existing, ...incoming]));
}

/**
 * Seed the timetable's default digest settings onto a newly added member —
 * but only if they have never saved their own (settings still `{}`). A user's
 * notification settings are global, so joining a second timetable must never
 * overwrite choices they've already made.
 */
async function seedDigestDefaults(
  userId: string,
  timetableId: string,
): Promise<void> {
  const [tt] = await db
    .select({ settings: timetables.settings })
    .from(timetables)
    .where(eq(timetables.id, timetableId))
    .limit(1);
  const defaults = tt?.settings?.digestDefaults;
  if (!defaults || Object.keys(defaults).length === 0) return;

  const [user] = await db
    .select({ notificationSettings: users.notificationSettings })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user || Object.keys(user.notificationSettings ?? {}).length > 0) return;

  await db
    .update(users)
    .set({ notificationSettings: defaults })
    .where(eq(users.id, userId));
}

/**
 * Invite a list of emails to a timetable with the given roles.
 *
 * - Existing user: create/update their membership immediately.
 * - Unknown email: store a pending invite to be claimed at sign-up.
 */
export async function inviteEmails(
  timetableId: string,
  invitedByUserId: string,
  emails: string[],
  roles: AssignableRole[],
): Promise<InviteOutcome[]> {
  const outcomes: InviteOutcome[] = [];
  const uniqueEmails = Array.from(
    new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean)),
  );

  for (const email of uniqueEmails) {
    const [existingUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (existingUser) {
      const [membership] = await db
        .select()
        .from(timetableMemberships)
        .where(
          and(
            eq(timetableMemberships.userId, existingUser.id),
            eq(timetableMemberships.timetableId, timetableId),
          ),
        )
        .limit(1);

      if (membership) {
        await db
          .update(timetableMemberships)
          .set({
            roles: mergeRoles(membership.roles, roles),
            updatedAt: new Date(),
          })
          .where(eq(timetableMemberships.id, membership.id));
        outcomes.push({ email, status: "membership_updated" });
      } else {
        await db.insert(timetableMemberships).values({
          userId: existingUser.id,
          timetableId,
          roles,
        });
        await seedDigestDefaults(existingUser.id, timetableId);
        outcomes.push({ email, status: "added" });
      }
      continue;
    }

    const expiresAt = new Date(
      Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000,
    );

    await db
      .insert(timetableInvites)
      .values({
        timetableId,
        email,
        roles,
        token: randomUUID(),
        invitedByUserId,
        status: "pending",
        expiresAt,
      })
      .onConflictDoUpdate({
        target: [timetableInvites.timetableId, timetableInvites.email],
        set: {
          roles,
          status: "pending",
          token: randomUUID(),
          invitedByUserId,
          expiresAt,
        },
      });
    outcomes.push({ email, status: "invited" });
  }

  return outcomes;
}

/**
 * Claim any pending invites matching a user's email, turning them into
 * memberships. Called after sign-up / first sign-in.
 */
export async function claimInvitesForUser(
  userId: string,
  email: string,
): Promise<number> {
  const normalized = email.trim().toLowerCase();
  const pending = await db
    .select()
    .from(timetableInvites)
    .where(
      and(
        eq(timetableInvites.email, normalized),
        eq(timetableInvites.status, "pending"),
      ),
    );

  let claimed = 0;
  for (const invite of pending) {
    const [membership] = await db
      .select()
      .from(timetableMemberships)
      .where(
        and(
          eq(timetableMemberships.userId, userId),
          eq(timetableMemberships.timetableId, invite.timetableId),
        ),
      )
      .limit(1);

    if (membership) {
      await db
        .update(timetableMemberships)
        .set({
          roles: mergeRoles(membership.roles, invite.roles),
          updatedAt: new Date(),
        })
        .where(eq(timetableMemberships.id, membership.id));
    } else {
      await db.insert(timetableMemberships).values({
        userId,
        timetableId: invite.timetableId,
        roles: invite.roles,
      });
      await seedDigestDefaults(userId, invite.timetableId);
    }

    await db
      .update(timetableInvites)
      .set({ status: "accepted", acceptedByUserId: userId })
      .where(eq(timetableInvites.id, invite.id));
    claimed += 1;
  }

  return claimed;
}
