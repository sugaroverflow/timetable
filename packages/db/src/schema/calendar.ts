import { relations } from "drizzle-orm";
import {
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { users } from "./auth";
import { availabilityStateEnum } from "./enums";
import { timetables } from "./timetables";
import { topics } from "./topics";

export const timeslots = pgTable(
  "timeslots",
  {
    id: uuid().primaryKey().defaultRandom(),
    timetableId: uuid()
      .notNull()
      .references(() => timetables.id, { onDelete: "cascade" }),
    startsAt: timestamp({ withTimezone: true }).notNull(),
    endsAt: timestamp({ withTimezone: true }).notNull(),
    location: text().notNull().default(""),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("timeslots_timetable_start_idx").on(t.timetableId, t.startsAt)],
);

export const availability = pgTable(
  "availability",
  {
    id: uuid().primaryKey().defaultRandom(),
    slotId: uuid()
      .notNull()
      .references(() => timeslots.id, { onDelete: "cascade" }),
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    state: availabilityStateEnum().notNull().default("yellow"),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("availability_slot_user_uq").on(t.slotId, t.userId)],
);

/** Slot discussion thread — visible to hosts and admins only ("host chat"). */
export const slotComments = pgTable(
  "slot_comments",
  {
    id: uuid().primaryKey().defaultRandom(),
    slotId: uuid()
      .notNull()
      .references(() => timeslots.id, { onDelete: "cascade" }),
    authorId: text()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    body: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("slot_comments_slot_idx").on(t.slotId)],
);

/** Tags a timeslot with a topic (admin booking a session into a slot). */
export const slotTopics = pgTable(
  "slot_topics",
  {
    slotId: uuid()
      .notNull()
      .references(() => timeslots.id, { onDelete: "cascade" }),
    topicId: uuid()
      .notNull()
      .references(() => topics.id, { onDelete: "cascade" }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.slotId, t.topicId] })],
);

export const timeslotsRelations = relations(timeslots, ({ one, many }) => ({
  timetable: one(timetables, {
    fields: [timeslots.timetableId],
    references: [timetables.id],
  }),
  availability: many(availability),
  comments: many(slotComments),
  slotTopics: many(slotTopics),
}));

export const availabilityRelations = relations(availability, ({ one }) => ({
  slot: one(timeslots, {
    fields: [availability.slotId],
    references: [timeslots.id],
  }),
  user: one(users, { fields: [availability.userId], references: [users.id] }),
}));

export const slotCommentsRelations = relations(slotComments, ({ one }) => ({
  slot: one(timeslots, {
    fields: [slotComments.slotId],
    references: [timeslots.id],
  }),
  author: one(users, {
    fields: [slotComments.authorId],
    references: [users.id],
  }),
}));

export const slotTopicsRelations = relations(slotTopics, ({ one }) => ({
  slot: one(timeslots, {
    fields: [slotTopics.slotId],
    references: [timeslots.id],
  }),
  topic: one(topics, {
    fields: [slotTopics.topicId],
    references: [topics.id],
  }),
}));
