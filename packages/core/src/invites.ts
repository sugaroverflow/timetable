import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";

import {
  db,
  timetableInvites,
  timetableMemberships,
  timetables,
  users,
  type NotificationSettings,
} from "@timetable/db";
import type { AssignableRole, Role } from "@timetable/shared";

import { logActivity } from "./activity";

export type InviteOutcome = {
  email: string;
  status: "added" | "membership_updated" | "invited";
};

const INVITE_TTL_DAYS = 30;

function mergeRoles(
  existing: readonly Role[],
  incoming: readonly Role[],
): Role[] {
  return Array.from(new Set<Role>([...existing, ...incoming]));
}

/**
 * The timetable's digest defaults, or null when none is actually enabled.
 * All-false defaults are indistinguishable from the {} a user starts with,
 * so seeding them would only burn the "never customized" guard and block a
 * later timetable's real defaults from applying.
 */
async function getDigestDefaults(
  timetableId: string,
): Promise<NotificationSettings | null> {
  const [tt] = await db
    .select({ settings: timetables.settings })
    .from(timetables)
    .where(eq(timetables.id, timetableId))
    .limit(1);
  const defaults = tt?.settings?.digestDefaults;
  if (!defaults || !Object.values(defaults).some(Boolean)) return null;
  return defaults;
}

/**
 * Seed digest defaults onto a newly added member — but only if they have
 * never saved their own (settings still `{}`). A user's notification settings
 * are global, so joining a second timetable must never overwrite choices
 * they've already made.
 */
async function seedDigestDefaults(
  userId: string,
  defaults: NotificationSettings,
): Promise<void> {
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
  const digestDefaults = await getDigestDefaults(timetableId);

  const logInvite = (email: string) =>
    logActivity({
      timetableId,
      actorId: invitedByUserId,
      action: "member.invite",
      payload: { invitedEmail: email, invitedRoles: roles },
    });

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
        await logInvite(email);
        outcomes.push({ email, status: "membership_updated" });
      } else {
        await db.insert(timetableMemberships).values({
          userId: existingUser.id,
          timetableId,
          roles,
        });
        if (digestDefaults) {
          await seedDigestDefaults(existingUser.id, digestDefaults);
        }
        await logInvite(email);
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
    await logInvite(email);
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
  // Invites may span timetables; fetch each timetable's defaults once.
  const defaultsByTimetable = new Map<string, NotificationSettings | null>();
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
      if (!defaultsByTimetable.has(invite.timetableId)) {
        defaultsByTimetable.set(
          invite.timetableId,
          await getDigestDefaults(invite.timetableId),
        );
      }
      const defaults = defaultsByTimetable.get(invite.timetableId);
      if (defaults) await seedDigestDefaults(userId, defaults);
      // Claiming an invite is the user's first sign-in here (QA #59 —
      // "logged in for the first time" on the activity log).
      await logActivity({
        timetableId: invite.timetableId,
        actorId: userId,
        action: "member.first_login",
        payload: { invitedEmail: normalized },
      });
    }

    await db
      .update(timetableInvites)
      .set({ status: "accepted", acceptedByUserId: userId })
      .where(eq(timetableInvites.id, invite.id));
    claimed += 1;
  }

  return claimed;
}
