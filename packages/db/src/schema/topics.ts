import { relations } from "drizzle-orm";
import {
  type AnyPgColumn,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { users } from "./auth";
import {
  commentVisibilityEnum,
  topicStatusEnum,
} from "./enums";
import { timetables } from "./timetables";

export const topics = pgTable(
  "topics",
  {
    id: uuid().primaryKey().defaultRandom(),
    timetableId: uuid()
      .notNull()
      .references(() => timetables.id, { onDelete: "cascade" }),
    hostId: text()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text().notNull(),
    // URL slug, unique per timetable. Generated from the title; may be
    // regenerated on title edits until first publish, frozen afterwards so
    // permalinks never break.
    slug: text(),
    bodyMd: text().notNull().default(""),
    coverImageUrl: text(),
    status: topicStatusEnum().notNull().default("draft"),
    publishedAt: timestamp({ withTimezone: true }),
    // Bumped only by host/admin edits to title/body/cover — never by status
    // churn. Drives "newest" sorting and the new-since-last-visit highlight
    // (QA #59: an edited topic counts as new; no email is triggered).
    contentUpdatedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("topics_timetable_status_idx").on(t.timetableId, t.status),
    index("topics_host_idx").on(t.hostId),
    uniqueIndex("topics_timetable_slug_uq").on(t.timetableId, t.slug),
  ],
);

export const hearts = pgTable(
  "hearts",
  {
    id: uuid().primaryKey().defaultRandom(),
    topicId: uuid()
      .notNull()
      .references(() => topics.id, { onDelete: "cascade" }),
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("hearts_topic_user_uq").on(t.topicId, t.userId),
    index("hearts_user_idx").on(t.userId),
  ],
);

export const comments = pgTable(
  "comments",
  {
    id: uuid().primaryKey().defaultRandom(),
    topicId: uuid()
      .notNull()
      .references(() => topics.id, { onDelete: "cascade" }),
    parentId: uuid().references((): AnyPgColumn => comments.id, {
      onDelete: "cascade",
    }),
    authorId: text()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    body: text().notNull(),
    visibility: commentVisibilityEnum().notNull().default("public"),
    hiddenAt: timestamp({ withTimezone: true }),
    hiddenByUserId: text().references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("comments_topic_idx").on(t.topicId),
    index("comments_parent_idx").on(t.parentId),
  ],
);

/** Append-only audit log of moderation and lifecycle actions per timetable. */
export const activityEvents = pgTable(
  "activity_events",
  {
    id: uuid().primaryKey().defaultRandom(),
    timetableId: uuid()
      .notNull()
      .references(() => timetables.id, { onDelete: "cascade" }),
    actorId: text().references(() => users.id, { onDelete: "set null" }),
    action: text().notNull(),
    payload: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    note: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("activity_timetable_idx").on(t.timetableId, t.createdAt)],
);

export const topicsRelations = relations(topics, ({ one, many }) => ({
  timetable: one(timetables, {
    fields: [topics.timetableId],
    references: [timetables.id],
  }),
  host: one(users, { fields: [topics.hostId], references: [users.id] }),
  hearts: many(hearts),
  comments: many(comments),
}));

export const heartsRelations = relations(hearts, ({ one }) => ({
  topic: one(topics, { fields: [hearts.topicId], references: [topics.id] }),
  user: one(users, { fields: [hearts.userId], references: [users.id] }),
}));

export const commentsRelations = relations(comments, ({ one, many }) => ({
  topic: one(topics, { fields: [comments.topicId], references: [topics.id] }),
  author: one(users, { fields: [comments.authorId], references: [users.id] }),
  parent: one(comments, {
    fields: [comments.parentId],
    references: [comments.id],
    relationName: "comment_replies",
  }),
  replies: many(comments, { relationName: "comment_replies" }),
}));

export const activityEventsRelations = relations(activityEvents, ({ one }) => ({
  timetable: one(timetables, {
    fields: [activityEvents.timetableId],
    references: [timetables.id],
  }),
  actor: one(users, {
    fields: [activityEvents.actorId],
    references: [users.id],
  }),
}));
