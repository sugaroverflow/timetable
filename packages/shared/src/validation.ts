import { z } from "zod";

import { ASSIGNABLE_ROLES, PRIVACY_LEVELS, ROLES } from "./roles";

const roleEnum = z.enum(ROLES);
const assignableRoleEnum = z.enum(ASSIGNABLE_ROLES);
const privacyEnum = z.enum(PRIVACY_LEVELS);

export const createTimetableSchema = z.object({
  name: z.string().min(1, "Name is required").max(120),
  slug: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers, hyphens")
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
