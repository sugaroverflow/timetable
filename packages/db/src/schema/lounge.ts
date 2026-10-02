import { relations } from "drizzle-orm";
import {
  type AnyPgColumn,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { users } from "./auth";
import { timetables } from "./timetables";

/** The {host} Lounge (docs/host-lounge-plan.md, 2026-09-30): one
 * hosts-and-admins-only threaded room per forum. Deliberately its OWN table,
 * not `comments` — nothing that reads topic comments (feed, counts, digests,
 * analytics, export) can see these rows, so the room is private by
 * construction rather than by a filter every reader must remember.
 *
 * A conversation is a root row (`parentId` null); its opening post's body is
 * Markdown (rendered + sanitized server-side like a topic body), replies are
 * plain text. `rootId` names the conversation every reply belongs to, and the
 * root's `lastActivityAt` is bumped by each new reply — the room is ordered
 * by it (bump order). Edits, reacts and moderation never bump. */
export const loungeComments = pgTable(
  "lounge_comments",
  {
    id: uuid().primaryKey().defaultRandom(),
    timetableId: uuid()
      .notNull()
      .references(() => timetables.id, { onDelete: "cascade" }),
    parentId: uuid().references((): AnyPgColumn => loungeComments.id, {
      onDelete: "cascade",
    }),
    /** The conversation's root; null on the root itself. */
    rootId: uuid().references((): AnyPgColumn => loungeComments.id, {
      onDelete: "cascade",
    }),
    authorId: text()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    body: text().notNull(),
    /** Roots only: the newest post in the conversation (bump order). */
    lastActivityAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    hiddenAt: timestamp({ withTimezone: true }),
    hiddenByUserId: text().references(() => users.id, { onDelete: "set null" }),
    /** Author soft-delete, as `comments.deletedAt`. */
    deletedAt: timestamp({ withTimezone: true }),
    editedAt: timestamp({ withTimezone: true }),
    /** Roots only; admins pin (a room has no author to own it). */
    pinnedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("lounge_comments_timetable_activity_idx").on(
      t.timetableId,
      t.lastActivityAt,
    ),
    index("lounge_comments_root_idx").on(t.rootId),
    index("lounge_comments_parent_idx").on(t.parentId),
    index("lounge_comments_author_idx").on(t.authorId),
  ],
);

/** @mentions in a Lounge post — drives Lounge mention notifications. */
export const loungeMentions = pgTable(
  "lounge_mentions",
  {
    id: uuid().primaryKey().defaultRandom(),
    commentId: uuid()
      .notNull()
      .references(() => loungeComments.id, { onDelete: "cascade" }),
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("lounge_mentions_comment_user_uq").on(t.commentId, t.userId),
    index("lounge_mentions_user_idx").on(t.userId),
  ],
);

/** Emoji reacts on Lounge posts — the first reactions in the codebase. One
 * row per (post, person, emoji). Never digested, never a bump. */
export const loungeReactions = pgTable(
  "lounge_reactions",
  {
    id: uuid().primaryKey().defaultRandom(),
    commentId: uuid()
      .notNull()
      .references(() => loungeComments.id, { onDelete: "cascade" }),
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    emoji: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("lounge_reactions_comment_user_emoji_uq").on(
      t.commentId,
      t.userId,
      t.emoji,
    ),
    index("lounge_reactions_user_idx").on(t.userId),
  ],
);

export const loungeCommentsRelations = relations(loungeComments, ({ one }) => ({
  timetable: one(timetables, {
    fields: [loungeComments.timetableId],
    references: [timetables.id],
  }),
  author: one(users, {
    fields: [loungeComments.authorId],
    references: [users.id],
  }),
}));
