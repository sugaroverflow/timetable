import { GraphQLError } from "graphql";

import {
  addSlotComment,
  buildCalendar,
  computeSlotCounts,
  createSlots,
  deleteSlot,
  deleteSlotComment,
  getAudienceElectorIds,
  getAvailabilityPattern,
  getSlotCommentById,
  getTopicById,
  getViewerRoles,
  listSlotComments,
  logActivity,
  proposeSlot,
  setAvailability,
  setAvailabilityPattern,
  setSlotCommentHidden,
  setSlotSession,
  updateSlot,
  updateSlotComment,
  type CalendarSlot,
  type PatternCells,
  type SlotInput,
} from "@timetable/core";
import type {
  AvailabilityState,
  SlotStatus,
  TimetableSettings,
} from "@timetable/db";
import {
  calendarConfirmPolicy,
  canConfirmSession,
  canManageCalendar,
  canProposeSession,
  canSeeHostOnly,
  canTouchSlotSession,
  isAdmin,
  isCalendarEnabled,
  isElector,
  isHost,
  officeHoursLabel,
  type Viewer,
} from "@timetable/shared";

import { assertActionLimit } from "../http/action-limits";
import { builder } from "./builder";
import {
  badRequest,
  forbidden,
  loadSlotAndViewer,
  loadTimetableAndViewer,
  notFound,
  parseAudience,
  readTimetable,
  requireUser,
} from "./guards";
import { TimetableType } from "./types";

// ---------------------------------------------------------------------------
// Gating + argument parsing
// ---------------------------------------------------------------------------

/** Every calendar read/write sits behind the forum-level flag. */
function requireCalendarEnabled(settings: TimetableSettings): void {
  if (!isCalendarEnabled(settings)) {
    forbidden("The calendar is not enabled for this forum");
  }
}

const AVAILABILITY_STATES = new Set(["green", "yellow", "red"]);

function parseState(raw: string): AvailabilityState {
  if (!AVAILABILITY_STATES.has(raw)) {
    throw new GraphQLError("Invalid availability state");
  }
  return raw as AvailabilityState;
}

/** "{weekday}-{HH:MM}" — weekday 0-6, 24h time. */
const CELL_KEY = /^[0-6]-([01]\d|2[0-3]):[0-5]\d$/;

/** Validate an elector's pattern grid: sane keys, known states, capped. */
function parsePatternCells(raw: string): PatternCells {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    badRequest("Invalid pattern JSON");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    badRequest("Pattern must be an object of cell → state");
  }
  const entries = Object.entries(parsed as Record<string, unknown>);
  if (entries.length > 200) badRequest("Too many pattern cells");
  const cells: PatternCells = {};
  for (const [key, value] of entries) {
    if (!CELL_KEY.test(key)) badRequest(`Invalid pattern cell key "${key}"`);
    if (typeof value !== "string" || !AVAILABILITY_STATES.has(value)) {
      badRequest(`Invalid state for pattern cell "${key}"`);
    }
    cells[key] = value as AvailabilityState;
  }
  return cells;
}

type SlotInputJson = {
  startsAt?: unknown;
  endsAt?: unknown;
  location?: unknown;
  cellKey?: unknown;
};

/** Validate the admin bulk-create payload (pattern × terms generation and
 * single hand-added slots both arrive here as JSON). */
function parseSlotInputs(raw: string): SlotInput[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    badRequest("Invalid slots JSON");
  }
  if (!Array.isArray(parsed)) badRequest("Slots must be an array");
  if (parsed.length === 0) badRequest("No slots to create");
  if (parsed.length > 500) badRequest("Too many slots in one request");
  return parsed.map((item: SlotInputJson, i) => {
    const startsAt = new Date(String(item.startsAt ?? ""));
    const endsAt = new Date(String(item.endsAt ?? ""));
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
      badRequest(`Slot ${i}: startsAt/endsAt must be ISO date-times`);
    }
    if (endsAt.getTime() <= startsAt.getTime()) {
      badRequest(`Slot ${i}: endsAt must be after startsAt`);
    }
    const cellKey =
      typeof item.cellKey === "string" && CELL_KEY.test(item.cellKey)
        ? item.cellKey
        : null;
    return {
      startsAt,
      endsAt,
      location: typeof item.location === "string" ? item.location : "",
      cellKey,
    };
  });
}

function parseSessionStatus(raw: string | null | undefined): SlotStatus {
  if (raw == null || raw === "proposed") return "proposed";
  if (raw === "confirmed") return "confirmed";
  throw new GraphQLError("Invalid session status");
}

/** A session URL must be absolute http(s), and short enough to be sane. */
function parseSessionUrl(raw: string | null | undefined): string {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return "";
  if (trimmed.length > 2000) badRequest("URL too long");
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    badRequest("Session URL must be a valid absolute URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    badRequest("Session URL must be http(s)");
  }
  return trimmed;
}

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
    image: string | null;
    state: string;
  }>("SlotAvailability")
  .implement({
    fields: (t) => ({
      userId: t.exposeID("userId"),
      name: t.exposeString("name", { nullable: true }),
      image: t.exposeString("image", { nullable: true }),
      state: t.exposeString("state"),
    }),
  });

const SlotTopicType = builder
  .objectRef<{
    id: string;
    title: string;
    topicSlug: string | null;
    hostId: string;
    hostName: string | null;
  }>("SlotTopic")
  .implement({
    fields: (t) => ({
      id: t.exposeID("id"),
      title: t.exposeString("title"),
      topicSlug: t.exposeString("topicSlug", { nullable: true }),
      hostId: t.exposeID("hostId"),
      hostName: t.exposeString("hostName", { nullable: true }),
    }),
  });

const SessionHostType = builder
  .objectRef<{ id: string; name: string | null }>("SessionHost")
  .implement({
    fields: (t) => ({
      id: t.exposeID("id"),
      name: t.exposeString("name", { nullable: true }),
    }),
  });

const TimeslotType = builder.objectRef<GqlSlot>("Timeslot").implement({
  fields: (t) => ({
    id: t.exposeID("id"),
    startsAt: t.string({ resolve: (s) => s.startsAt.toISOString() }),
    endsAt: t.string({ resolve: (s) => s.endsAt.toISOString() }),
    location: t.exposeString("location"),
    status: t.exposeString("status"),
    url: t.exposeString("url"),
    cellKey: t.exposeString("cellKey", { nullable: true }),
    commentCount: t.exposeInt("commentCount"),
    viewerState: t.exposeString("viewerState", { nullable: true }),
    topic: t.field({
      type: SlotTopicType,
      nullable: true,
      resolve: (s) => s.topic,
    }),
    /** Office-hours sessions (no topic): whose they are (QA 2026-08-03). */
    sessionHost: t.field({
      type: SessionHostType,
      nullable: true,
      resolve: (s) => s.sessionHost,
    }),
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
    authorImage: string | null;
    body: string;
    topicId: string | null;
    topicTitle: string | null;
    counts: { green: number; yellow: number; red: number } | null;
    editedAt: Date | null;
    hidden: boolean;
    createdAt: Date;
  }>("SlotComment")
  .implement({
    fields: (t) => ({
      id: t.exposeID("id"),
      authorId: t.exposeID("authorId"),
      authorName: t.exposeString("authorName", { nullable: true }),
      authorImage: t.exposeString("authorImage", { nullable: true }),
      body: t.exposeString("body"),
      topicId: t.exposeID("topicId", { nullable: true }),
      topicTitle: t.exposeString("topicTitle", { nullable: true }),
      counts: t.field({
        type: AvailabilityCountsType,
        nullable: true,
        resolve: (c) => c.counts,
      }),
      editedAt: t.string({
        nullable: true,
        resolve: (c) => c.editedAt?.toISOString() ?? null,
      }),
      hidden: t.exposeBoolean("hidden"),
      createdAt: t.string({ resolve: (c) => c.createdAt.toISOString() }),
    }),
  });

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

builder.queryFields((t) => ({
  /** The availability calendar for a timetable (role-aware). Empty when the
   * forum hasn't enabled the calendar. */
  calendar: t.field({
    type: [TimeslotType],
    args: {
      idOrSlug: t.arg.string({ required: true }),
      audience: t.arg.string({ required: false }),
      includePast: t.arg.boolean({ required: false }),
    },
    resolve: async (_p, args, ctx) => {
      const readable = await readTimetable(ctx, args.idOrSlug);
      if (!readable) return [];
      if (!isCalendarEnabled(readable.timetable.settings)) return [];
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
        { includePast: args.includePast ?? false },
      );
      return slots.map((s) => ({ ...s, canSeeHostOnly: hostOnly }));
    },
  }),

  /** Slot discussion thread (host/admin only; admins also see hidden). */
  slotComments: t.field({
    type: [SlotCommentType],
    args: { slotId: t.arg.string({ required: true }) },
    resolve: async (_p, args, ctx) => {
      const { viewer, timetable } = await loadSlotAndViewer(ctx, args.slotId);
      if (!isCalendarEnabled(timetable.settings)) return [];
      if (!canSeeHostOnly(viewer)) return [];
      return listSlotComments(args.slotId, {
        includeHidden: canManageCalendar(viewer),
      });
    },
  }),

  /** The viewer's weekly availability template, as a JSON cell → state map. */
  myAvailabilityPattern: t.string({
    nullable: true,
    args: { idOrSlug: t.arg.string({ required: true }) },
    resolve: async (_p, args, ctx) => {
      if (!ctx.user) return null;
      const readable = await readTimetable(ctx, args.idOrSlug);
      if (!readable) return null;
      if (!isCalendarEnabled(readable.timetable.settings)) return null;
      const cells = await getAvailabilityPattern(
        readable.timetable.id,
        ctx.user.id,
      );
      return JSON.stringify(cells);
    },
  }),
}));

// ---------------------------------------------------------------------------
// Slot grid mutations (admin) + host off-piste proposals
// ---------------------------------------------------------------------------

builder.mutationFields((t) => ({
  /** Admin: bulk-create slots (pattern × terms generation, or one slot).
   * Exact duplicates are skipped, so regeneration is idempotent. */
  createTimeslots: t.field({
    type: "Int",
    args: {
      idOrSlug: t.arg.string({ required: true }),
      slotsJson: t.arg.string({ required: true }),
    },
    resolve: async (_p, args, ctx) => {
      const { readable, viewer } = await loadTimetableAndViewer(
        ctx,
        args.idOrSlug,
      );
      requireCalendarEnabled(readable.timetable.settings);
      if (!canManageCalendar(viewer)) forbidden("Admins only");
      const inputs = parseSlotInputs(args.slotsJson);
      const created = await createSlots(readable.timetable.id, inputs);
      if (created.length > 0) {
        await logActivity({
          timetableId: readable.timetable.id,
          actorId: ctx.user?.id ?? null,
          action: "calendar.schedule",
          note: `${created.length} slot${created.length === 1 ? "" : "s"} generated`,
        });
      }
      return created.length;
    },
  }),

  /** Host (policy-gated) or admin: propose an off-piste slot — for a
   * topic, or (QA 2026-08-03) as office hours for `sessionHostId` — born
   * `proposed`, collecting availability from day one. */
  proposeSlot: t.field({
    type: TimetableType,
    args: {
      idOrSlug: t.arg.string({ required: true }),
      startsAt: t.arg.string({ required: true }),
      endsAt: t.arg.string({ required: true }),
      location: t.arg.string({ required: false }),
      topicId: t.arg.string({ required: false }),
      /** Office hours: the host the session is for (topicId omitted). */
      sessionHostId: t.arg.string({ required: false }),
    },
    resolve: async (_p, args, ctx) => {
      const { user, readable, viewer } = await loadTimetableAndViewer(
        ctx,
        args.idOrSlug,
      );
      requireCalendarEnabled(readable.timetable.settings);
      const policy = calendarConfirmPolicy(readable.timetable.settings);
      if (!canProposeSession(viewer, policy)) {
        forbidden("Slot proposals are admin-only in this forum");
      }
      const subject = await resolveSessionSubject(
        viewer,
        readable.timetable,
        args.topicId,
        args.sessionHostId,
      );
      const { startsAt, endsAt } = parseSlotWindow(args.startsAt, args.endsAt);
      const slot = await proposeSlot(readable.timetable.id, user.id, {
        startsAt,
        endsAt,
        location: args.location ?? "",
        topicId: subject.topicId,
        sessionHostId: subject.sessionHostId,
      });
      await logActivity({
        timetableId: readable.timetable.id,
        actorId: user.id,
        action: "slot.propose",
        payload: {
          slotId: slot.id,
          startsAt: startsAt.toISOString(),
          ...subject.payloadExtra,
        },
        ...(subject.note ? { note: subject.note } : {}),
      });
      return { ...readable.timetable, viewerRoles: readable.roles as string[] };
    },
  }),

  /** Admin: update a timeslot's time/location. */
  updateTimeslot: t.field({
    type: "Boolean",
    args: {
      slotId: t.arg.string({ required: true }),
      startsAt: t.arg.string({ required: false }),
      endsAt: t.arg.string({ required: false }),
      location: t.arg.string({ required: false }),
    },
    resolve: async (_p, args, ctx) => {
      await requireUser(ctx);
      const { slot, viewer, timetable } = await loadSlotAndViewer(
        ctx,
        args.slotId,
      );
      requireCalendarEnabled(timetable.settings);
      if (!canManageCalendar(viewer)) forbidden("Admins only");
      await updateSlot(slot.id, {
        startsAt: args.startsAt ? new Date(args.startsAt) : undefined,
        endsAt: args.endsAt ? new Date(args.endsAt) : undefined,
        location: args.location ?? undefined,
      });
      return true;
    },
  }),

  /** Admin: delete a timeslot. */
  deleteTimeslot: t.field({
    type: "Boolean",
    args: { slotId: t.arg.string({ required: true }) },
    resolve: async (_p, args, ctx) => {
      await requireUser(ctx);
      const { slot, viewer, timetable } = await loadSlotAndViewer(
        ctx,
        args.slotId,
      );
      requireCalendarEnabled(timetable.settings);
      if (!canManageCalendar(viewer)) forbidden("Admins only");
      await deleteSlot(slot.id);
      return true;
    },
  }),
}));

// ---------------------------------------------------------------------------
// Session lifecycle
// ---------------------------------------------------------------------------

/** Hosts act only on their own topics; admins on any topic in the forum.
 * Every path also pins the topic to the slot's timetable so a foreign
 * topic id can't be attached. */
async function assertOwnTopicInTimetable(
  viewer: Viewer,
  topicId: string,
  timetableId: string,
) {
  const topic = await getTopicById(topicId);
  if (!topic || topic.timetableId !== timetableId) {
    notFound("Topic not found in this forum");
  }
  if (!canManageCalendar(viewer) && topic.hostId !== viewer.userId) {
    forbidden("You can only pencil in your own topics");
  }
  return topic;
}

/** Office-hours target (QA 2026-08-03): hosts book themselves only;
 * admins may book any member who holds the host or admin role. */
async function assertOfficeHoursHost(
  viewer: Viewer,
  sessionHostId: string,
  timetableId: string,
): Promise<void> {
  if (!canManageCalendar(viewer) && sessionHostId !== viewer.userId) {
    forbidden("You can only pencil in your own office hours");
  }
  const roles = await getViewerRoles(sessionHostId, timetableId);
  if (!isHost(roles) && !isAdmin(roles)) {
    forbidden("Office hours belong to a host or admin of this forum");
  }
}

type SessionSubject = {
  topicId: string | null;
  sessionHostId: string;
  /** Extra activity payload — topicId+title auto-link the timeline. */
  payloadExtra: Record<string, unknown>;
  /** Office hours: the forum's label rides as the activity note. */
  note: string | null;
};

/** Validate a session subject — a topic, or office hours for a host — and
 * derive the ownership column + activity-log fields for it. */
async function resolveSessionSubject(
  viewer: Viewer,
  timetable: { id: string; settings: TimetableSettings },
  topicIdArg: string | null | undefined,
  sessionHostIdArg: string | null | undefined,
): Promise<SessionSubject> {
  if (topicIdArg != null) {
    const topic = await assertOwnTopicInTimetable(
      viewer,
      topicIdArg,
      timetable.id,
    );
    return {
      topicId: topic.id,
      sessionHostId: topic.hostId,
      payloadExtra: { topicId: topic.id, title: topic.title },
      note: null,
    };
  }
  if (sessionHostIdArg == null) {
    badRequest("Pick a topic session or office hours");
  }
  await assertOfficeHoursHost(viewer, sessionHostIdArg, timetable.id);
  return {
    topicId: null,
    sessionHostId: sessionHostIdArg,
    payloadExtra: {},
    note: officeHoursLabel(timetable.settings),
  };
}

/** Un-pencil a slot back to empty, logging what was cleared. */
async function clearSlotSession(
  ctx: {
    slot: { id: string; status: string };
    timetable: { id: string; settings: TimetableSettings };
    actorId: string;
  },
  currentTopic: { id: string; title: string } | null,
  eventBase: Record<string, unknown>,
): Promise<void> {
  await setSlotSession(ctx.slot.id, { topicId: null, sessionHostId: null });
  if (ctx.slot.status === "empty") return;
  await logActivity({
    timetableId: ctx.timetable.id,
    actorId: ctx.actorId,
    action: "slot.clear",
    payload: currentTopic
      ? { ...eventBase, topicId: currentTopic.id, title: currentTopic.title }
      : eventBase,
    ...(currentTopic ? {} : { note: officeHoursLabel(ctx.timetable.settings) }),
  });
}

/** Pencilling needs the propose gate, confirming the confirm gate. */
function assertStatusGate(
  viewer: Viewer,
  policy: ReturnType<typeof calendarConfirmPolicy>,
  status: SlotStatus,
): void {
  const gate = status === "confirmed" ? canConfirmSession : canProposeSession;
  if (!gate(viewer, policy)) {
    forbidden(
      status === "confirmed"
        ? "Confirming sessions is admin-only in this forum"
        : "Pencilling sessions is admin-only in this forum",
    );
  }
}

/** Validated start/end for a hand-proposed slot. */
function parseSlotWindow(
  startsAtRaw: string,
  endsAtRaw: string,
): { startsAt: Date; endsAt: Date } {
  const startsAt = new Date(startsAtRaw);
  const endsAt = new Date(endsAtRaw);
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
    badRequest("startsAt/endsAt must be ISO date-times");
  }
  if (endsAt.getTime() <= startsAt.getTime()) {
    badRequest("endsAt must be after startsAt");
  }
  return { startsAt, endsAt };
}

builder.mutationFields((t) => ({
  /** Set (or clear, with both ids null) a slot's session — a topic, or
   * (QA 2026-08-03) an office-hours session for `sessionHostId`, plus
   * status and URL. Who may do what depends on the forum's confirm
   * policy; a host can never displace another host's session. */
  setSlotSession: t.field({
    type: "Boolean",
    args: {
      slotId: t.arg.string({ required: true }),
      topicId: t.arg.string({ required: false }),
      /** Office hours: the host the session is for (topicId omitted). */
      sessionHostId: t.arg.string({ required: false }),
      status: t.arg.string({ required: false }),
      url: t.arg.string({ required: false }),
    },
    resolve: async (_p, args, ctx) => {
      const user = await requireUser(ctx);
      const { slot, viewer, timetable } = await loadSlotAndViewer(
        ctx,
        args.slotId,
      );
      requireCalendarEnabled(timetable.settings);
      const policy = calendarConfirmPolicy(timetable.settings);

      // sessionHostId is THE ownership column; legacy rows fall back to
      // the topic's host.
      const currentTopic = slot.topicId
        ? await getTopicById(slot.topicId)
        : null;
      const currentOwner = slot.sessionHostId ?? currentTopic?.hostId ?? null;
      if (!canTouchSlotSession(viewer, currentOwner)) {
        forbidden("Another host's session is pencilled into this slot");
      }

      const eventBase = {
        slotId: slot.id,
        startsAt: slot.startsAt.toISOString(),
      };

      if (args.topicId == null && args.sessionHostId == null) {
        // Clearing back to empty ("un-pencil"): admins, or the host whose
        // own session it is (canTouchSlotSession above already pinned that).
        if (!canProposeSession(viewer, policy)) forbidden();
        await clearSlotSession(
          { slot, timetable, actorId: user.id },
          currentTopic,
          eventBase,
        );
        return true;
      }

      const status = parseSessionStatus(args.status);
      assertStatusGate(viewer, policy, status);

      const subject = await resolveSessionSubject(
        viewer,
        timetable,
        args.topicId,
        args.sessionHostId,
      );
      await setSlotSession(slot.id, {
        topicId: subject.topicId,
        sessionHostId: subject.sessionHostId,
        status,
        url: parseSessionUrl(args.url),
      });
      // Re-confirming (e.g. a URL edit) still logs slot.confirm — the log
      // is a feed, and the fresh URL is the news.
      await logActivity({
        timetableId: timetable.id,
        actorId: user.id,
        action: status === "confirmed" ? "slot.confirm" : "slot.pencil",
        payload: { ...eventBase, ...subject.payloadExtra },
        ...(subject.note ? { note: subject.note } : {}),
      });
      return true;
    },
  }),
}));

// ---------------------------------------------------------------------------
// Availability + discussion
// ---------------------------------------------------------------------------

builder.mutationFields((t) => ({
  /** Elector: set availability for one slot (an explicit answer — it beats
   * the pattern layer for that slot). */
  setAvailability: t.field({
    type: "Boolean",
    args: {
      slotId: t.arg.string({ required: true }),
      state: t.arg.string({ required: true }),
    },
    resolve: async (_p, args, ctx) => {
      const user = await requireUser(ctx);
      const { slot, viewer, timetable } = await loadSlotAndViewer(
        ctx,
        args.slotId,
      );
      requireCalendarEnabled(timetable.settings);
      if (!isElector(viewer.roles)) forbidden("Electors only");
      const state = parseState(args.state);
      await setAvailability(slot.id, user.id, state);
      await logActivity({
        timetableId: timetable.id,
        actorId: user.id,
        action: "availability.set",
        payload: {
          slotId: slot.id,
          startsAt: slot.startsAt.toISOString(),
          state,
        },
      });
      return true;
    },
  }),

  /** Elector: replace their weekly availability template. */
  setMyAvailabilityPattern: t.field({
    type: "Boolean",
    args: {
      idOrSlug: t.arg.string({ required: true }),
      cellsJson: t.arg.string({ required: true }),
    },
    resolve: async (_p, args, ctx) => {
      const { user, readable } = await loadTimetableAndViewer(
        ctx,
        args.idOrSlug,
      );
      requireCalendarEnabled(readable.timetable.settings);
      if (!isElector(readable.roles)) forbidden("Electors only");
      const cells = parsePatternCells(args.cellsJson);
      await setAvailabilityPattern(readable.timetable.id, user.id, cells);
      await logActivity({
        timetableId: readable.timetable.id,
        actorId: user.id,
        action: "availability.pattern",
      });
      return true;
    },
  }),

  /** Host/admin: post to a slot discussion — optionally as a session claim
   * carrying a topic and the availability snapshot the server computes for
   * that topic's hearters at this moment. */
  addSlotComment: t.field({
    type: SlotCommentType,
    args: {
      slotId: t.arg.string({ required: true }),
      body: t.arg.string({ required: true }),
      topicId: t.arg.string({ required: false }),
    },
    resolve: async (_p, args, ctx) => {
      const user = await requireUser(ctx);
      const { slot, viewer, timetable } = await loadSlotAndViewer(
        ctx,
        args.slotId,
      );
      requireCalendarEnabled(timetable.settings);
      if (!canSeeHostOnly(viewer)) forbidden("Hosts/admins only");
      const body = args.body.trim();
      if (!body) throw new GraphQLError("Comment cannot be empty");
      await assertActionLimit(user.id, "comment");

      let claim: Parameters<typeof addSlotComment>[3];
      let claimTopic: { id: string; title: string } | null = null;
      if (args.topicId) {
        const topic = await getTopicById(args.topicId);
        if (!topic || topic.timetableId !== timetable.id) {
          notFound("Topic not found in this forum");
        }
        const hearters = await getAudienceElectorIds(timetable.id, {
          kind: "hearted_topic",
          topicId: topic.id,
        });
        claim = {
          topicId: topic.id,
          counts: await computeSlotCounts(slot, hearters),
        };
        claimTopic = topic;
      }

      const comment = await addSlotComment(slot.id, user.id, body, claim);
      await logActivity({
        timetableId: timetable.id,
        actorId: user.id,
        action: "slot.comment",
        payload: {
          slotId: slot.id,
          startsAt: slot.startsAt.toISOString(),
          ...(claimTopic
            ? { topicId: claimTopic.id, title: claimTopic.title }
            : {}),
        },
        note: body,
      });
      const thread = await listSlotComments(slot.id);
      const view = thread.find((c) => c.id === comment.id);
      if (!view) notFound("Comment not found");
      return view;
    },
  }),
}));

// ---------------------------------------------------------------------------
// Slot-comment edit / delete / hide (QA 2026-08-03) — mirroring topic
// comments: authors edit and hard-delete their own (the thread is flat, no
// reply structure to preserve); admins hide/unhide.
// ---------------------------------------------------------------------------

/** Load a slot comment plus its slot/viewer/timetable, calendar-gated. */
async function loadCommentContext(
  ctx: Parameters<typeof loadSlotAndViewer>[0],
  commentId: string,
) {
  const comment = await getSlotCommentById(commentId);
  if (!comment) notFound("Comment not found");
  const loaded = await loadSlotAndViewer(ctx, comment.slotId);
  requireCalendarEnabled(loaded.timetable.settings);
  return { comment, ...loaded };
}

builder.mutationFields((t) => ({
  /** Author: edit their own slot comment. */
  updateSlotComment: t.field({
    type: "Boolean",
    args: {
      commentId: t.arg.string({ required: true }),
      body: t.arg.string({ required: true }),
    },
    resolve: async (_p, args, ctx) => {
      const user = await requireUser(ctx);
      const { comment } = await loadCommentContext(ctx, args.commentId);
      if (comment.authorId !== user.id) forbidden("Not your comment");
      const body = args.body.trim();
      if (!body) throw new GraphQLError("Comment cannot be empty");
      await updateSlotComment(comment.id, body);
      return true;
    },
  }),

  /** Author: delete their own slot comment. */
  deleteSlotComment: t.field({
    type: "Boolean",
    args: { commentId: t.arg.string({ required: true }) },
    resolve: async (_p, args, ctx) => {
      const user = await requireUser(ctx);
      const { comment } = await loadCommentContext(ctx, args.commentId);
      if (comment.authorId !== user.id) forbidden("Not your comment");
      await deleteSlotComment(comment.id);
      return true;
    },
  }),

  /** Admin: hide/unhide a slot comment. */
  hideSlotComment: t.field({
    type: "Boolean",
    args: {
      commentId: t.arg.string({ required: true }),
      hidden: t.arg.boolean({ required: true }),
    },
    resolve: async (_p, args, ctx) => {
      const user = await requireUser(ctx);
      const { comment, viewer } = await loadCommentContext(ctx, args.commentId);
      if (!canManageCalendar(viewer)) forbidden("Admins only");
      await setSlotCommentHidden(comment.id, args.hidden, user.id);
      return true;
    },
  }),
}));
