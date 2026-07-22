import { z } from "zod";

import { ASSIGNABLE_ROLES, PRIVACY_LEVELS, ROLES } from "./roles";

const roleEnum = z.enum(ROLES);
const assignableRoleEnum = z.enum(ASSIGNABLE_ROLES);
const privacyEnum = z.enum(PRIVACY_LEVELS);

/**
 * Canonical email form used everywhere emails are stored or compared
 * (invites, membership claims, Clerk lookups). Kept as a plain helper rather
 * than a zod `.transform()`: the core functions that need it are also called
 * with inputs that never pass through these schemas, so they must normalize
 * regardless.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export const createTimetableSchema = z.object({
  name: z.string().min(1, "Name is required").max(120),
  slug: z
    .string()
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      "Use lowercase letters, numbers, hyphens",
    )
    .max(60)
    .optional(),
  description: z.string().max(2000).optional(),
  privacy: privacyEnum.optional(),
});
export type CreateTimetableInput = z.infer<typeof createTimetableSchema>;

export const inviteSchema = z.object({
  emails: z.array(z.string().email()).min(1, "Add at least one email"),
  roles: z.array(assignableRoleEnum).min(1, "Pick at least one role"),
});
export type InviteInput = z.infer<typeof inviteSchema>;

/** Admin "add person" (product feedback round 2): pre-create an account with
 * a real email, populate it, then send the invite email separately. */
export const addPersonSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(120).optional(),
  roles: z.array(assignableRoleEnum).min(1, "Pick at least one role"),
});
export type AddPersonInput = z.infer<typeof addPersonSchema>;

export const updateMemberRolesSchema = z.object({
  roles: z.array(roleEnum),
});
export type UpdateMemberRolesInput = z.infer<typeof updateMemberRolesSchema>;

export const updateProfileSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  bio: z.string().max(2000).optional(),
  image: z.string().url().optional(),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
