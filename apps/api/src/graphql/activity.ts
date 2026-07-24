import {
  countUnreadNotifications,
  listActivity,
  listNotifications,
  markNotificationsSeen,
  type ActivityEntry,
} from "@timetable/core";
import { canModerate } from "@timetable/shared";

import { builder } from "./builder";
import { loadTimetableAndViewer, readTimetable } from "./guards";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

const ActivityType = builder
  .objectRef<ActivityEntry>("ActivityEvent")
  .implement({
    fields: (t) => ({
      id: t.exposeID("id"),
      action: t.exposeString("action"),
      note: t.exposeString("note", { nullable: true }),
      actorId: t.exposeString("actorId", { nullable: true }),
      actorName: t.exposeString("actorName", { nullable: true }),
      actorImage: t.exposeString("actorImage", { nullable: true }),
      actorRoles: t.exposeStringList("actorRoles"),
      createdAt: t.string({ resolve: (a) => a.createdAt.toISOString() }),
      // Enrichment (QA #42): which topic the event refers to, and what was
      // said/done — all sourced from the event payload + a slug join.
      topicTitle: t.string({
        nullable: true,
        resolve: (a) => (a.payload["title"] as string | undefined) ?? null,
      }),
      topicSlug: t.exposeString("topicSlug", { nullable: true }),
      topicHostSlug: t.exposeString("topicHostSlug", { nullable: true }),
      topicHostName: t.exposeString("topicHostName", { nullable: true }),
      snippet: t.string({
        nullable: true,
        resolve: (a) => (a.payload["snippet"] as string | undefined) ?? null,
      }),
      /** For comment events: anchors the timeline link to the comment. */
      commentId: t.string({
        nullable: true,
        resolve: (a) => (a.payload["commentId"] as string | undefined) ?? null,
      }),
      /** For member.invite events (QA #59). */
      invitedEmail: t.string({
        nullable: true,
        resolve: (a) =>
          (a.payload["invitedEmail"] as string | undefined) ?? null,
      }),
      invitedRoles: t.stringList({
        resolve: (a) =>
          (a.payload["invitedRoles"] as string[] | undefined) ?? [],
      }),
    }),
  });

const NotificationType = builder
  .objectRef<import("@timetable/core").NotificationItem>("Notification")
  .implement({
    fields: (t) => ({
      commentId: t.exposeID("commentId"),
      kind: t.exposeString("kind"),
      authorId: t.exposeID("authorId"),
      authorName: t.exposeString("authorName", { nullable: true }),
      body: t.exposeString("body"),
      visibility: t.exposeString("visibility"),
      createdAt: t.string({ resolve: (n) => n.createdAt.toISOString() }),
      topicId: t.exposeID("topicId"),
      topicTitle: t.exposeString("topicTitle"),
      topicSlug: t.exposeString("topicSlug", { nullable: true }),
      topicHostSlug: t.exposeString("topicHostSlug", { nullable: true }),
    }),
  });

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

builder.queryFields((t) => ({
  /** Comments on the viewer's topics + replies to their comments
   * (QA #59 notifications pane). Members only. */
  notifications: t.field({
    type: [NotificationType],
    args: { idOrSlug: t.arg.string({ required: true }) },
    resolve: async (_p, args, ctx) => {
      if (!ctx.user) return [];
      const readable = await readTimetable(ctx, args.idOrSlug);
      if (!readable || readable.roles.length === 0) return [];
      return listNotifications(readable.timetable.id, ctx.user.id);
    },
  }),

  /** Unread-notification count for the sidebar badge. */
  notificationsUnread: t.int({
    args: { idOrSlug: t.arg.string({ required: true }) },
    resolve: async (_p, args, ctx) => {
      if (!ctx.user) return 0;
      const readable = await readTimetable(ctx, args.idOrSlug);
      if (!readable || readable.roles.length === 0) return 0;
      return countUnreadNotifications(readable.timetable.id, ctx.user.id);
    },
  }),

  /** Activity timeline (admin only). */
  activityTimeline: t.field({
    type: [ActivityType],
    args: {
      idOrSlug: t.arg.string({ required: true }),
      actorId: t.arg.string({ required: false }),
      from: t.arg.string({ required: false }),
      to: t.arg.string({ required: false }),
    },
    resolve: async (_p, args, ctx) => {
      const readable = await readTimetable(ctx, args.idOrSlug);
      if (!readable) return [];
      const viewer = { userId: ctx.user?.id ?? null, roles: readable.roles };
      if (!canModerate(viewer)) return [];
      const parseDay = (
        value: string | null | undefined,
        endOfDay: boolean,
      ) => {
        if (!value) return undefined;
        const parsed = Date.parse(value);
        if (Number.isNaN(parsed)) return undefined;
        const date = new Date(parsed);
        if (endOfDay) date.setUTCHours(23, 59, 59, 999);
        return date;
      };
      return listActivity(readable.timetable.id, {
        actorId: args.actorId ?? undefined,
        from: parseDay(args.from, false),
        to: parseDay(args.to, true),
      });
    },
  }),
}));

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

builder.mutationFields((t) => ({
  /** Resets the notifications badge (QA #59). */
  markNotificationsSeen: t.boolean({
    args: { idOrSlug: t.arg.string({ required: true }) },
    resolve: async (_p, args, ctx) => {
      const { user, readable } = await loadTimetableAndViewer(
        ctx,
        args.idOrSlug,
      );
      await markNotificationsSeen(readable.timetable.id, user.id);
      return true;
    },
  }),
}));
