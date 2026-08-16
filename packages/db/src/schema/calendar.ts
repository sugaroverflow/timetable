import { isNull, relations, sql } from "drizzle-orm";
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

/** A timeslot is a pure TIME WINDOW (bookings model, 2026-08-06 — split
 * from the old time×location rows): one row per (forum, start, end).
 * Availability and discussion attach here, because both are about the
 * time; what happens in the slot — and where — lives in `slot_sessions`,
 * zero-to-many per slot. */
export const timeslots = pgTable(
  "timeslots",
  {
    id: uuid().primaryKey().defaultRandom(),
    timetableId: uuid()
      .notNull()
      .references(() => timetables.id, { onDelete: "cascade" }),
    startsAt: timestamp({ withTimezone: true }).notNull(),
    endsAt: timestamp({ withTimezone: true }).notNull(),
    /** Who created the slot — null for admin/grid slots created before this
     * column; set for host off-piste proposals. */
    createdById: text().references(() => users.id, { onDelete: "set null" }),
    /** Provenance key "{weekday}-{HH:MM}" linking a generated slot to the
     * forum's pattern cell (weekday/time in the forum's local clock, stamped
     * at generation). Null for hand-created and off-piste slots — those get
     * no pattern inference. */
    cellKey: text(),
    /** Locations offered at this time, chosen at creation (2026-08-11) —
     * adding a same-time slot for another location unions into this row
     * rather than duplicating it. Empty only on legacy rows and in forums
     * with no configured locations (location-free behaviour). */
    locations: text().array().notNull().default([]),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("timeslots_timetable_start_idx").on(t.timetableId, t.startsAt),
    // One slot per time window; the DST-wobble dedup in createSlots still
    // matters (same cell, different UTC instants), this guards exact dupes.
    uniqueIndex("timeslots_timetable_time_uq").on(
      t.timetableId,
      t.startsAt,
      t.endsAt,
    ),
  ],
);

/** A booking in a timeslot: a session subject (topic, office-hours host,
 * or an admin's custom title). Pencils are location-less time-intents
 * (2026-08-14, demand-first): any number of subjects can pencil the same
 * time — a pencil is the host saying "I am available at this time" — so
 * the only uniqueness is one pencil per topic (and one office-hours pencil
 * per host) per slot. The room is decided at CONFIRM time (2026-08-14,
 * same day): a confirmed session acquires a `location`, and confirmed
 * sessions are exclusive per (slot, location) — location-free forums keep
 * working, their confirms simply have no location. */
export const slotSessions = pgTable(
  "slot_sessions",
  {
    id: uuid().primaryKey().defaultRandom(),
    slotId: uuid()
      .notNull()
      .references(() => timeslots.id, { onDelete: "cascade" }),
    location: text().notNull().default(""),
    /** The booked topic; null for office hours and custom sessions. */
    topicId: uuid().references(() => topics.id, { onDelete: "set null" }),
    /** Whose session this is — the topic's host for topic sessions, the
     * host themselves for office hours, null for admin custom sessions.
     * THE ownership column for the never-displace rule. */
    sessionHostId: text().references(() => users.id, { onDelete: "set null" }),
    /** Admin-filled custom session ("Departmental seminar") — a session
     * whose subject is neither a topic nor a host; admin-only. */
    customTitle: text().notNull().default(""),
    /** proposed (pencilled) → confirmed; "empty" is unused here — an empty
     * slot simply has no session rows. */
    status: slotStatusEnum().notNull().default("proposed"),
    /** Where the session actually lives once published elsewhere (Luma,
     * event page…). The calendar points at it; it never becomes it. */
    url: text().notNull().default(""),
    createdById: text().references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // topicId is nullable and Postgres treats NULLs as distinct, so this
    // constrains topic sessions only.
    uniqueIndex("slot_sessions_slot_topic_uq").on(t.slotId, t.topicId),
    // Office-hours rows only (topic sessions also carry sessionHostId —
    // a host may pencil several of their topics into one slot).
    uniqueIndex("slot_sessions_slot_oh_host_uq")
      .on(t.slotId, t.sessionHostId)
      .where(isNull(t.topicId)),
    // Confirm-time locations (2026-08-14): two confirmed sessions cannot
    // share a room at the same time. Pencils (proposed) and location-less
    // confirms stay unconstrained.
    uniqueIndex("slot_sessions_slot_confirmed_location_uq")
      .on(t.slotId, t.location)
      .where(sql`${t.status} = 'confirmed' and ${t.location} <> ''`),
    index("slot_sessions_slot_idx").on(t.slotId),
    // Topic-first lookups run on every feed page (sessionSlotCount) and
    // the sessions tab; all other indexes here lead with slotId.
    index("slot_sessions_topic_idx").on(t.topicId),
  ],
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
    /** Set on author edits only — drives the "(edited)" marker. */
    editedAt: timestamp({ withTimezone: true }),
    /** Admin moderation, mirroring topic comments (QA 2026-08-03). Hidden
     * comments stay visible to admins; authors hard-delete instead (the
     * thread is flat, so there's no reply structure to preserve). */
    hiddenAt: timestamp({ withTimezone: true }),
    hiddenByUserId: text().references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("slot_comments_slot_idx").on(t.slotId)],
);

export const timeslotsRelations = relations(timeslots, ({ one, many }) => ({
  timetable: one(timetables, {
    fields: [timeslots.timetableId],
    references: [timetables.id],
  }),
  createdBy: one(users, {
    fields: [timeslots.createdById],
    references: [users.id],
  }),
  sessions: many(slotSessions),
  availability: many(availability),
  comments: many(slotComments),
}));

export const slotSessionsRelations = relations(slotSessions, ({ one }) => ({
  slot: one(timeslots, {
    fields: [slotSessions.slotId],
    references: [timeslots.id],
  }),
  topic: one(topics, {
    fields: [slotSessions.topicId],
    references: [topics.id],
  }),
  sessionHost: one(users, {
    fields: [slotSessions.sessionHostId],
    references: [users.id],
  }),
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
