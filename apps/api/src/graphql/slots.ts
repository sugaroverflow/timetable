import { GraphQLError } from "graphql";

import {
  addSlotComment,
  buildCalendar,
  createSlots,
  deleteSlot,
  getAudienceElectorIds,
  getUserById,
  listSlotComments,
  setAvailability,
  setWeekdayAvailability,
  tagSlotTopic,
  untagSlotTopic,
  updateSlot,
  type CalendarSlot,
} from "@timetable/core";
import type { AvailabilityState } from "@timetable/db";
import { canSeeHostOnly, isAdmin, isElector } from "@timetable/shared";

import { builder } from "./builder";
import {
  forbidden,
  loadSlotAndViewer,
  loadTimetableAndViewer,
  notFound,
  parseAudience,
  readTimetable,
  requireUser,
} from "./guards";
import { SlotTagType, TimetableType } from "./types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type GqlSlot = CalendarSlot & { canSeeHostOnly: boolean };

const AvailabilityCountsType = builder
  .objectRef<{
    green: number;
    yellow: number;
    red: number;
  }>("AvailabilityCounts")
  .implement({
    fields: (t) => ({
      green: t.exposeInt("green"),
      yellow: t.exposeInt("yellow"),
      red: t.exposeInt("red"),
    }),
  });

const SlotAvailabilityType = builder
  .objectRef<{
    userId: string;
    name: string | null;
    state: string;
  }>("SlotAvailability")
  .implement({
    fields: (t) => ({
      userId: t.exposeID("userId"),
      name: t.exposeString("name", { nullable: true }),
      state: t.exposeString("state"),
    }),
  });

const TimeslotType = builder.objectRef<GqlSlot>("Timeslot").implement({
  fields: (t) => ({
    id: t.exposeID("id"),
    startsAt: t.string({ resolve: (s) => s.startsAt.toISOString() }),
    endsAt: t.string({ resolve: (s) => s.endsAt.toISOString() }),
    location: t.exposeString("location"),
    commentCount: t.exposeInt("commentCount"),
    viewerState: t.exposeString("viewerState", { nullable: true }),
    topics: t.field({ type: [SlotTagType], resolve: (s) => s.topics }),
    counts: t.field({ type: AvailabilityCountsType, resolve: (s) => s.counts }),
    // Per-elector availability is host/admin-only.
    perUser: t.field({
      type: [SlotAvailabilityType],
      nullable: true,
      resolve: (s) => (s.canSeeHostOnly ? s.perUser : null),
    }),
  }),
});

const SlotCommentType = builder
  .objectRef<{
    id: string;
    authorId: string;
    authorName: string | null;
    body: string;
    createdAt: Date;
  }>("SlotComment")
  .implement({
    fields: (t) => ({
      id: t.exposeID("id"),
      authorId: t.exposeID("authorId"),
      authorName: t.exposeString("authorName", { nullable: true }),
      body: t.exposeString("body"),
      createdAt: t.string({ resolve: (c) => c.createdAt.toISOString() }),
    }),
  });

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

builder.queryFields((t) => ({
  /** The availability calendar for a timetable (role-aware). */
  calendar: t.field({
    type: [TimeslotType],
    args: {
      idOrSlug: t.arg.string({ required: true }),
      audience: t.arg.string({ required: false }),
    },
    resolve: async (_p, args, ctx) => {
      const readable = await readTimetable(ctx, args.idOrSlug);
      if (!readable) return [];
      const viewer = { userId: ctx.user?.id ?? null, roles: readable.roles };
      const hostOnly = canSeeHostOnly(viewer);
      const audience = parseAudience(args.audience, ctx.user?.id ?? null);
      const audienceIds = await getAudienceElectorIds(
        readable.timetable.id,
        audience,
      );
      const slots = await buildCalendar(
        readable.timetable.id,
        audienceIds,
        ctx.user?.id ?? null,
      );
      return slots.map((s) => ({ ...s, canSeeHostOnly: hostOnly }));
    },
  }),

  /** Slot discussion thread (host/admin only). */
  slotComments: t.field({
    type: [SlotCommentType],
    args: { slotId: t.arg.string({ required: true }) },
    resolve: async (_p, args, ctx) => {
      const { viewer } = await loadSlotAndViewer(ctx, args.slotId);
      if (!canSeeHostOnly(viewer)) return [];
      return listSlotComments(args.slotId);
    },
  }),
}));

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

builder.mutationFields((t) => ({
  /** Admin: create a single timeslot. */
  createTimeslot: t.field({
    type: TimetableType,
    args: {
      idOrSlug: t.arg.string({ required: true }),
      startsAt: t.arg.string({ required: true }),
      endsAt: t.arg.string({ required: true }),
      location: t.arg.string({ required: false }),
    },
    resolve: async (_p, args, ctx) => {
      const { readable } = await loadTimetableAndViewer(ctx, args.idOrSlug);
      if (!isAdmin(readable.roles)) forbidden("Admins only");
      await createSlots(readable.timetable.id, [
        {
          startsAt: new Date(args.startsAt),
          endsAt: new Date(args.endsAt),
          location: args.location ?? "",
        },
      ]);
      return { ...readable.timetable, viewerRoles: readable.roles as string[] };
    },
  }),

  /** Admin: create N weekly-repeating timeslots from a starting slot. */
  createWeeklyTimeslots: t.field({
    type: TimetableType,
    args: {
      idOrSlug: t.arg.string({ required: true }),
      startsAt: t.arg.string({ required: true }),
      endsAt: t.arg.string({ required: true }),
      location: t.arg.string({ required: false }),
      count: t.arg.int({ required: true }),
    },
    resolve: async (_p, args, ctx) => {
      const { readable } = await loadTimetableAndViewer(ctx, args.idOrSlug);
      if (!isAdmin(readable.roles)) forbidden("Admins only");
      const start = new Date(args.startsAt);
      const end = new Date(args.endsAt);
      const week = 7 * 24 * 60 * 60 * 1000;
      const n = Math.max(1, Math.min(args.count, 52));
      const inputs = Array.from({ length: n }, (_v, i) => ({
        startsAt: new Date(start.getTime() + i * week),
        endsAt: new Date(end.getTime() + i * week),
        location: args.location ?? "",
      }));
      await createSlots(readable.timetable.id, inputs);
      return { ...readable.timetable, viewerRoles: readable.roles as string[] };
    },
  }),

  /** Admin: update a timeslot. */
  updateTimeslot: t.field({
    type: TimetableType,
    args: {
      slotId: t.arg.string({ required: true }),
      startsAt: t.arg.string({ required: false }),
      endsAt: t.arg.string({ required: false }),
      location: t.arg.string({ required: false }),
    },
    resolve: async (_p, args, ctx) => {
      const { slot, viewer } = await loadSlotAndViewer(ctx, args.slotId);
      if (!isAdmin(viewer.roles)) forbidden("Admins only");
      await updateSlot(slot.id, {
        startsAt: args.startsAt ? new Date(args.startsAt) : undefined,
        endsAt: args.endsAt ? new Date(args.endsAt) : undefined,
        location: args.location ?? undefined,
      });
      const readable = await readTimetable(ctx, slot.timetableId);
      if (!readable) notFound("Timetable not found");
      return { ...readable.timetable, viewerRoles: readable.roles as string[] };
    },
  }),

  /** Admin: delete a timeslot. */
  deleteTimeslot: t.field({
    type: "Boolean",
    args: { slotId: t.arg.string({ required: true }) },
    resolve: async (_p, args, ctx) => {
      const { slot, viewer } = await loadSlotAndViewer(ctx, args.slotId);
      if (!isAdmin(viewer.roles)) forbidden("Admins only");
      await deleteSlot(slot.id);
      return true;
    },
  }),
}));

builder.mutationFields((t) => ({
  /** Elector: set availability for one slot. */
  setAvailability: t.field({
    type: "Boolean",
    args: {
      slotId: t.arg.string({ required: true }),
      state: t.arg.string({ required: true }),
    },
    resolve: async (_p, args, ctx) => {
      const user = await requireUser(ctx);
      const { slot, viewer } = await loadSlotAndViewer(ctx, args.slotId);
      if (!isElector(viewer.roles)) forbidden("Electors only");
      const state = args.state as AvailabilityState;
      if (state !== "green" && state !== "yellow" && state !== "red") {
        throw new GraphQLError("Invalid availability state");
      }
      await setAvailability(slot.id, user.id, state);
      return true;
    },
  }),

  /** Elector: set availability for every slot on a weekday (0=Sun..6=Sat). */
  setWeekdayAvailability: t.field({
    type: "Int",
    args: {
      idOrSlug: t.arg.string({ required: true }),
      weekday: t.arg.int({ required: true }),
      state: t.arg.string({ required: true }),
    },
    resolve: async (_p, args, ctx) => {
      const { user, readable } = await loadTimetableAndViewer(
        ctx,
        args.idOrSlug,
      );
      if (!isElector(readable.roles)) forbidden("Electors only");
      const state = args.state as AvailabilityState;
      if (state !== "green" && state !== "yellow" && state !== "red") {
        throw new GraphQLError("Invalid availability state");
      }
      return setWeekdayAvailability(
        readable.timetable.id,
        user.id,
        args.weekday,
        state,
      );
    },
  }),

  /** Host/admin: post to a slot discussion. */
  addSlotComment: t.field({
    type: SlotCommentType,
    args: {
      slotId: t.arg.string({ required: true }),
      body: t.arg.string({ required: true }),
    },
    resolve: async (_p, args, ctx) => {
      const user = await requireUser(ctx);
      const { slot, viewer } = await loadSlotAndViewer(ctx, args.slotId);
      if (!canSeeHostOnly(viewer)) forbidden("Hosts/admins only");
      const body = args.body.trim();
      if (!body) throw new GraphQLError("Comment cannot be empty");
      const comment = await addSlotComment(slot.id, user.id, body);
      const author = await getUserById(user.id);
      return {
        id: comment.id,
        authorId: comment.authorId,
        authorName: author?.name ?? null,
        body: comment.body,
        createdAt: comment.createdAt,
      };
    },
  }),

  /** Admin: tag a slot with a topic. */
  tagSlotTopic: t.field({
    type: "Boolean",
    args: {
      slotId: t.arg.string({ required: true }),
      topicId: t.arg.string({ required: true }),
    },
    resolve: async (_p, args, ctx) => {
      const { slot, viewer } = await loadSlotAndViewer(ctx, args.slotId);
      if (!isAdmin(viewer.roles)) forbidden("Admins only");
      await tagSlotTopic(slot.id, args.topicId);
      return true;
    },
  }),

  /** Admin: remove a topic tag from a slot. */
  untagSlotTopic: t.field({
    type: "Boolean",
    args: {
      slotId: t.arg.string({ required: true }),
      topicId: t.arg.string({ required: true }),
    },
    resolve: async (_p, args, ctx) => {
      const { slot, viewer } = await loadSlotAndViewer(ctx, args.slotId);
      if (!isAdmin(viewer.roles)) forbidden("Admins only");
      await untagSlotTopic(slot.id, args.topicId);
      return true;
    },
  }),
}));
