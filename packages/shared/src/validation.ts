import { z } from "zod";

import { ASSIGNABLE_ROLES, PRIVACY_LEVELS, ROLES } from "./roles";
import { CONFIRM_POLICIES } from "./settings";

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

/** Forum URL slug shape — shared by creation and the Forum Settings slug
 * editor (editable slugs, 2026-08-10). */
export const forumSlugSchema = z
  .string()
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "Use lowercase letters, numbers, hyphens",
  )
  .max(60);

export const createTimetableSchema = z.object({
  name: z.string().min(1, "Name is required").max(120),
  slug: forumSlugSchema.optional(),
  privacy: privacyEnum.optional(),
});
export type CreateTimetableInput = z.infer<typeof createTimetableSchema>;

export const inviteSchema = z.object({
  emails: z.array(z.string().email()).min(1, "Add at least one email"),
  roles: z.array(assignableRoleEnum).min(1, "Pick at least one role"),
});
export type InviteInput = z.infer<typeof inviteSchema>;

/** Admin email correction for a member who has never signed in
 * (2026-07-29): fixing pre-created accounts and invite typos. */
export const updateMemberEmailSchema = z.object({
  email: z.string().email().max(320),
});
export type UpdateMemberEmailInput = z.infer<typeof updateMemberEmailSchema>;

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

/** "HH:MM", 24-hour. */
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
/** "YYYY-MM-DD" (string comparison then orders correctly). */
const YMD = /^\d{4}-\d{2}-\d{2}$/;

/** Admin-editable calendar settings (calendar v2). Unknown keys are
 * rejected; the API shallow-merges a validated patch over the stored
 * calendar group. */
export const calendarSettingsSchema = z
  .object({
    enabled: z.boolean().optional(),
    confirmPolicy: z.enum(CONFIRM_POLICIES).optional(),
    officeHoursLabel: z.string().max(40).optional(),
    locations: z.array(z.string().max(80)).max(50).optional(),
    patternCells: z
      .array(
        z
          .object({
            weekday: z.number().int().min(0).max(6),
            start: z.string().regex(HHMM),
            end: z.string().regex(HHMM),
          })
          .refine((c) => c.end > c.start, "end must be after start"),
      )
      .max(50)
      .optional(),
    terms: z
      .array(
        z
          .object({
            name: z.string().max(60),
            start: z.string().regex(YMD),
            end: z.string().regex(YMD),
          })
          .refine((t) => t.end >= t.start, "end must not precede start"),
      )
      .max(24)
      .optional(),
  })
  .strict();
export type CalendarSettingsInput = z.infer<typeof calendarSettingsSchema>;
