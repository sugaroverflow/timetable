import { pgEnum } from "drizzle-orm/pg-core";

/** Timetable visibility (QA #42 granularity). Enforced in the
 * service/authorization layer:
 * - public: all topics, comments, and bios visible to everyone
 * - hosts_only: topics + host bios visible to the public; no comments
 * - no_comments: topics + all bios visible to the public; no comments
 * - private: members only
 * - deactivated: admins only
 * Non-member signed-in users are treated like anonymous visitors. */
export const privacyEnum = pgEnum("timetable_privacy", [
  "deactivated",
  "private",
  "public",
  "hosts_only",
  "no_comments",
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

/** Topic lifecycle: draft -> submitted -> published / unpublished (or archived). */
export const topicStatusEnum = pgEnum("topic_status", [
  "draft",
  "submitted",
  "published",
  "unpublished",
  "archived",
]);

/**
 * Comment visibility. Public comments are readable by everyone who can read the
 * timetable (including anonymous on public timetables). Host-only comments and
 * admin feedback are visible to hosts and admins only.
 */
export const commentVisibilityEnum = pgEnum("comment_visibility", [
  "public",
  "host_only",
]);

/** Elector availability for a timeslot. Default is yellow ("maybe"). */
export const availabilityStateEnum = pgEnum("availability_state", [
  "green",
  "yellow",
  "red",
]);
