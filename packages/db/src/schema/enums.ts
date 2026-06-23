import { pgEnum } from "drizzle-orm/pg-core";

/** Timetable visibility. Enforced in the service/authorization layer. */
export const privacyEnum = pgEnum("timetable_privacy", [
  "deactivated",
  "private",
  "public",
]);

/** Roles are scoped to a single timetable via membership, never global. */
export const roleEnum = pgEnum("timetable_role", [
  "owner",
  "admin",
  "host",
  "elector",
]);

/** Lifecycle of an emailed invite to join a timetable. */
export const inviteStatusEnum = pgEnum("invite_status", [
  "pending",
  "accepted",
  "revoked",
]);
