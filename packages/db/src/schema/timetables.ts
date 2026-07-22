import { relations } from "drizzle-orm";
import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import type { TimetableSettings } from "@timetable/shared";

import { users } from "./auth";
import { inviteStatusEnum, privacyEnum, roleEnum } from "./enums";

/** Per-timetable settings shapes (role labels, theme, digest defaults) are
 * defined in @timetable/shared; re-exported here for schema consumers. */
export type { ThemeSettings, TimetableSettings } from "@timetable/shared";

export const timetables = pgTable("timetables", {
  id: uuid().primaryKey().defaultRandom(),
  slug: text().notNull().unique(),
  name: text().notNull(),
  description: text(),
  privacy: privacyEnum().notNull().default("private"),
  customDomain: text().unique(),
  settings: jsonb()
    .$type<TimetableSettings>()
    .notNull()
    .default({}),
  // Heart-count cutoff (QA #42): hearts created before this timestamp are
  // ignored wherever counts/weights are computed. Null = count everything.
  heartsCountFrom: timestamp({ withTimezone: true }),
  ownerId: text()
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

/**
 * Joins a global user to a timetable with one or more roles. This is the single
 * source of truth for authorization: a user may be admin in one timetable and
 * elector-only in another.
 */
export const timetableMemberships = pgTable(
  "timetable_memberships",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    timetableId: uuid()
      .notNull()
      .references(() => timetables.id, { onDelete: "cascade" }),
    roles: roleEnum().array().notNull(),
    // Watermark for the feed's "new since your last visit" highlight;
    // null until the member first views the feed.
    lastSeenFeedAt: timestamp({ withTimezone: true }),
    // Watermark for the notifications pane's unread badge (QA #59);
    // null until the member first opens Notifications.
    lastSeenNotificationsAt: timestamp({ withTimezone: true }),
    // When the invite email was last sent to this member (product feedback
    // round 2: admins pre-create accounts, populate them, then send the
    // invite explicitly). Null = added but never invited.
    inviteSentAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("memberships_user_timetable_uq").on(t.userId, t.timetableId),
    index("memberships_timetable_idx").on(t.timetableId),
  ],
);

/**
 * Pending invite to join a timetable. A user must sign up separately first;
 * accepting an invite (matched by email) creates the membership.
 */
export const timetableInvites = pgTable(
  "timetable_invites",
  {
    id: uuid().primaryKey().defaultRandom(),
    timetableId: uuid()
      .notNull()
      .references(() => timetables.id, { onDelete: "cascade" }),
    email: text().notNull(),
    roles: roleEnum().array().notNull(),
    status: inviteStatusEnum().notNull().default("pending"),
    token: text().notNull().unique(),
    invitedByUserId: text().references(() => users.id, {
      onDelete: "set null",
    }),
    acceptedByUserId: text().references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    uniqueIndex("invites_timetable_email_uq").on(t.timetableId, t.email),
    index("invites_email_idx").on(t.email),
  ],
);

export const usersRelations = relations(users, ({ many }) => ({
  memberships: many(timetableMemberships),
  ownedTimetables: many(timetables),
}));

export const timetablesRelations = relations(timetables, ({ one, many }) => ({
  owner: one(users, {
    fields: [timetables.ownerId],
    references: [users.id],
  }),
  memberships: many(timetableMemberships),
  invites: many(timetableInvites),
}));

export const membershipsRelations = relations(
  timetableMemberships,
  ({ one }) => ({
    user: one(users, {
      fields: [timetableMemberships.userId],
      references: [users.id],
    }),
    timetable: one(timetables, {
      fields: [timetableMemberships.timetableId],
      references: [timetables.id],
    }),
  }),
);

export const invitesRelations = relations(timetableInvites, ({ one }) => ({
  timetable: one(timetables, {
    fields: [timetableInvites.timetableId],
    references: [timetables.id],
  }),
}));
