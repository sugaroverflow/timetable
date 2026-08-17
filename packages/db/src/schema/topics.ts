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
import { commentVisibilityEnum, topicStatusEnum } from "./enums";
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
    status: topicStatusEnum().notNull().default("submitted"),
    publishedAt: timestamp({ withTimezone: true }),
    // Host's "Ready to publish" signal (2026-08-06): null = still drafting.
    // Only meaningful while status is "submitted" — the admin Pending queue
    // filters on it; publish/unpublish clear it. A timestamp (not a bool) so
    // the queue can show how long a topic has been waiting.
    readyAt: timestamp({ withTimezone: true }),
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

/** Host 💙s (2026-08-04): the parallel gesture for host-non-elector
 * members, mirroring `hearts` in its own table so the elector-heart
 * pipelines (weights, feed, analytics) stay untouched. Never enters
 * elector weighting; unaffected by the heartsCountFrom cutoff (a 💙 is
 * interest, not a ballot). */
export const hostHearts = pgTable(
  "host_hearts",
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
    uniqueIndex("host_hearts_topic_user_uq").on(t.topicId, t.userId),
    index("host_hearts_user_idx").on(t.userId),
  ],
);

/** Append-only ❤️/💙 ledger (2026-08-05): one row per gesture event, never
 * updated or deleted by the app. The `hearts`/`host_hearts` tables stay the
 * mutable current state (toggles delete rows; a cutoff revival bumps
 * `createdAt`) — this table is what lets history be reconstructed across
 * un-hearts and termly cutoff resets. Backfilled at migration time from the
 * then-current heart rows. */
export const heartEvents = pgTable(
  "heart_events",
  {
    id: uuid().primaryKey().defaultRandom(),
    timetableId: uuid()
      .notNull()
      .references(() => timetables.id, { onDelete: "cascade" }),
    topicId: uuid()
      .notNull()
      .references(() => topics.id, { onDelete: "cascade" }),
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Which gesture: an elector ❤️ or a host 💙. */
    kind: text().$type<"heart" | "host_heart">().notNull(),
    action: text().$type<"add" | "remove">().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("heart_events_timetable_idx").on(t.timetableId, t.createdAt),
    index("heart_events_topic_idx").on(t.topicId),
  ],
);

/** Topic Queue exposure record (2026-07-28): one row per (topic, user)
 * the user has been shown in the queue — or hearted anywhere (a heart
 * implies having seen it). `seenAt` is bumped on each showing; "seen this
 * round" compares it to the membership's `queueRoundStartedAt`. A row's
 * existence at all is the exposure signal for analytics. */
export const topicSeen = pgTable(
  "topic_seen",
  {
    topicId: uuid()
      .notNull()
      .references(() => topics.id, { onDelete: "cascade" }),
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    seenAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("topic_seen_topic_user_uq").on(t.topicId, t.userId),
    index("topic_seen_user_idx").on(t.userId),
  ],
);

/** Per-(user, topic) comments-seen watermark (dialogue-first threading,
 * 2026-08-13): bumped when the viewer ENGAGES with a topic's discussion —
 * expands the card's comment teaser or opens the permalink — never by
 * merely loading a feed page (that blanket signal is the membership's
 * lastSeenFeedAt). Drives the teaser's "new" comment previews. */
export const commentSeen = pgTable(
  "comment_seen",
  {
    topicId: uuid()
      .notNull()
      .references(() => topics.id, { onDelete: "cascade" }),
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    seenAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("comment_seen_topic_user_uq").on(t.topicId, t.userId),
    index("comment_seen_user_idx").on(t.userId),
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
    /** Author soft-delete (QA 2026-07-29): tombstoned in threads when
     * replies exist, dropped otherwise; excluded from counts everywhere.
     * Distinct from hiddenAt, which is admin moderation. */
    deletedAt: timestamp({ withTimezone: true }),
    /** Set on author edits only — updatedAt also moves on hide/unhide, so
     * it can't drive the "(edited)" marker. */
    editedAt: timestamp({ withTimezone: true }),
    /** Pinned by the topic's author (#258, 2026-08-17): top-level comments
     * only, sorted to the top of the thread — earliest pin first, so the
     * author curates the order by pinning sequence. */
    pinnedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("comments_topic_idx").on(t.topicId),
    index("comments_parent_idx").on(t.parentId),
    // The digest cron resolves each recipient's chain scope by author
    // (loadChainScope) — without this it full-scans comments per user.
    index("comments_author_idx").on(t.authorId),
  ],
);

/** @mentions in a comment (product feedback round 1): one row per mentioned
 * member. Populated on insert for public comments; drives mention
 * notifications. */
export const commentMentions = pgTable(
  "comment_mentions",
  {
    id: uuid().primaryKey().defaultRandom(),
    commentId: uuid()
      .notNull()
      .references(() => comments.id, { onDelete: "cascade" }),
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("comment_mentions_comment_user_uq").on(t.commentId, t.userId),
    index("comment_mentions_user_idx").on(t.userId),
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

export const heartEventsRelations = relations(heartEvents, ({ one }) => ({
  timetable: one(timetables, {
    fields: [heartEvents.timetableId],
    references: [timetables.id],
  }),
  topic: one(topics, {
    fields: [heartEvents.topicId],
    references: [topics.id],
  }),
  user: one(users, { fields: [heartEvents.userId], references: [users.id] }),
}));

export const hostHeartsRelations = relations(hostHearts, ({ one }) => ({
  topic: one(topics, {
    fields: [hostHearts.topicId],
    references: [topics.id],
  }),
  user: one(users, { fields: [hostHearts.userId], references: [users.id] }),
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
