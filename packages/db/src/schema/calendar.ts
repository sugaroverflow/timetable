import { relations } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { users } from "./auth";
import { availabilityStateEnum, slotStatusEnum } from "./enums";
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
    /** Session state (calendar v2): empty → proposed → confirmed. */
    status: slotStatusEnum().notNull().default("empty"),
    /** The one pencilled/confirmed topic. Singular by design: simultaneous
     * sessions are separate slots (same time, different location). */
    topicId: uuid().references(() => topics.id, { onDelete: "set null" }),
    /** Where the session actually lives once published elsewhere (Luma,
     * event page…). The calendar points at it; it never becomes it. */
    url: text().notNull().default(""),
    /** Who created the slot — null for admin/grid slots created before this
     * column; set for host off-piste proposals. */
    createdById: text().references(() => users.id, { onDelete: "set null" }),
    /** Provenance key "{weekday}-{HH:MM}" linking a generated slot to the
     * forum's pattern cell (weekday/time in the forum's local clock, stamped
     * at generation). Null for hand-created and off-piste slots — those get
     * no pattern inference. */
    cellKey: text(),
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

/** An elector's standing weekly availability template (calendar v2): one row
 * per (forum, user), cells keyed "{weekday}-{HH:MM}" matching the forum's
 * pattern cells. Slots resolve explicit answer → pattern cell → yellow. */
export const availabilityPatterns = pgTable(
  "availability_patterns",
  {
    timetableId: uuid()
      .notNull()
      .references(() => timetables.id, { onDelete: "cascade" }),
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    cells: jsonb()
      .$type<Record<string, "green" | "yellow" | "red">>()
      .notNull()
      .default({}),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.timetableId, t.userId] })],
);

/** Slot discussion thread — visible to hosts and admins only ("host chat").
 * A comment may carry a session claim: a topic plus the availability counts
 * snapshot the author saw when posting ("I'd like this slot for Yoga ·
 * 4🟢 8🟡 2🔴"). Counts are server-computed at post time and deliberately
 * frozen — they record what the claim was based on. */
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
    topicId: uuid().references(() => topics.id, { onDelete: "set null" }),
    greenCount: integer(),
    yellowCount: integer(),
    redCount: integer(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("slot_comments_slot_idx").on(t.slotId)],
);

export const timeslotsRelations = relations(timeslots, ({ one, many }) => ({
  timetable: one(timetables, {
    fields: [timeslots.timetableId],
    references: [timetables.id],
  }),
  topic: one(topics, {
    fields: [timeslots.topicId],
    references: [topics.id],
  }),
  createdBy: one(users, {
    fields: [timeslots.createdById],
    references: [users.id],
  }),
  availability: many(availability),
  comments: many(slotComments),
}));

export const availabilityRelations = relations(availability, ({ one }) => ({
  slot: one(timeslots, {
    fields: [availability.slotId],
    references: [timeslots.id],
  }),
  user: one(users, { fields: [availability.userId], references: [users.id] }),
}));

export const availabilityPatternsRelations = relations(
  availabilityPatterns,
  ({ one }) => ({
    timetable: one(timetables, {
      fields: [availabilityPatterns.timetableId],
      references: [timetables.id],
    }),
    user: one(users, {
      fields: [availabilityPatterns.userId],
      references: [users.id],
    }),
  }),
);

export const slotCommentsRelations = relations(slotComments, ({ one }) => ({
  slot: one(timeslots, {
    fields: [slotComments.slotId],
    references: [timeslots.id],
  }),
  author: one(users, {
    fields: [slotComments.authorId],
    references: [users.id],
  }),
  topic: one(topics, {
    fields: [slotComments.topicId],
    references: [topics.id],
  }),
}));
