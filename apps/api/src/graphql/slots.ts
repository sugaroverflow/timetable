import { GraphQLError } from "graphql";

import {
  addSlotComment,
  addSlotSession,
  buildCalendar,
  computeSlotCounts,
  confirmedLocationTaken,
  createSlots,
  deleteSlot,
  deleteSlotComment,
  deleteSlotSessionRow,
  getAudienceElectorIds,
  getAvailabilityPattern,
  getSlotCommentById,
  getSlotSessionById,
  getTopicById,
  getViewerRoles,
  listSlotComments,
  listTopicSessions,
  logActivity,
  proposeSlot,
  setAvailability,
  setAvailabilityPattern,
  setSlotCommentHidden,
  slotSubjectTaken,
  updateSlot,
  updateSlotComment,
  updateSlotSessionRow,
  type CalendarSession,
  type CalendarSlot,
  type PatternCells,
  type SlotInput,
  type TopicSessionRow,
} from "@timetable/core";
import type {
  AvailabilityState,
  SlotStatus,
  TimetableSettings,
} from "@timetable/db";
import {
  calendarConfirmPolicy,
  canConfirmSession,
  canDiscussSlots,
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
  locations?: unknown;
  cellKey?: unknown;
};

/** A slot's offered locations: trimmed, deduped, capped in count and size. */
function parseSlotLocations(raw: unknown, label: string): string[] {
  if (raw == null) return [];
  if (!Array.isArray(raw)) badRequest(`${label}: locations must be an array`);
  const locations = [
    ...new Set(
      raw.map((l) => (typeof l === "string" ? l.trim() : "")).filter(Boolean),
    ),
  ];
  if (locations.length > 50) badRequest(`${label}: too many locations`);
  if (locations.some((l) => l.length > 80)) {
    badRequest(`${label}: location name too long`);
  }
  return locations;
}

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
      locations: parseSlotLocations(item.locations, `Slot ${i}`),
      cellKey,
    };
  });
}

function parseSessionStatus(raw: string | null | undefined): SlotStatus {
  if (raw == null || raw === "proposed") return "proposed";
  if (raw === "confirmed") return "confirmed";
  throw new GraphQLError("Invalid session status");
}

/** An admin's custom session title — trimmed, capped. */
function parseCustomTitle(raw: string | null | undefined): string {
  const trimmed = (raw ?? "").trim();
  if (trimmed.length > 200) badRequest("Session title too long");
  return trimmed;
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

/** A confirm-time location — trimmed, capped like slot locations. */
function parseSessionLocation(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length > 80) badRequest("Location name too long");
  return trimmed;
}

/** Did this write trip `slot_sessions_slot_confirmed_location_uq`? The
 * pre-flight can race a concurrent confirm; the partial unique index is
 * the backstop, mapped to the same friendly error. */
function isConfirmedLocationConflict(err: unknown): boolean {
  for (let e = err; e instanceof Error; e = e.cause as Error) {
    const code = (e as { code?: unknown }).code;
    if (code === "23505" && e.message.includes("slot_confirmed_location")) {
      return true;
    }
  }
  return false;
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

/** A booking in a slot (bookings model, 2026-08-06): subject + location +
 * status. Several can share a slot — different locations, same time. */
const SlotSessionType = builder
  .objectRef<CalendarSession>("SlotSession")
  .implement({
    fields: (t) => ({
      id: t.exposeID("id"),
      location: t.exposeString("location"),
      status: t.exposeString("status"),
      url: t.exposeString("url"),
      /** Admin-filled custom session title ("" when not custom). */
      customTitle: t.exposeString("customTitle"),
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
    }),
  });

const TimeslotType = builder.objectRef<GqlSlot>("Timeslot").implement({
  fields: (t) => ({
    id: t.exposeID("id"),
    startsAt: t.string({ resolve: (s) => s.startsAt.toISOString() }),
    endsAt: t.string({ resolve: (s) => s.endsAt.toISOString() }),
    cellKey: t.exposeString("cellKey", { nullable: true }),
    /** Locations offered at this time (empty on legacy/location-free slots). */
    locations: t.exposeStringList("locations"),
    commentCount: t.exposeInt("commentCount"),
    viewerState: t.exposeString("viewerState", { nullable: true }),
    /** The slot's bookings, location-sorted; empty for an open slot. */
    sessions: t.field({
      type: [SlotSessionType],
      resolve: (s) => s.sessions,
    }),
    /** Group availability is host/admin-only (Ed, 2026-08-16 — decided
     * the deferred question): electors and anonymous viewers get null,
     * not a number they could add up. The wash was already hidden from
     * them in the UI; the payload now matches. */
    counts: t.field({
      type: AvailabilityCountsType,
      nullable: true,
      resolve: (s) => (s.canSeeHostOnly ? s.counts : null),
    }),
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
    authorRoles: string[];
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
      authorRoles: t.exposeStringList("authorRoles"),
      body: t.exposeString("body"),
      topicId: t.exposeID("topicId", { nullable: true }),
      topicTitle: t.exposeString("topicTitle", { nullable: true }),
      /** The claim's frozen snapshot. Stripped for non-hosts by the
       * `slotComments` resolver — gating live counts would mean nothing
       * if the same tallies sat one click into the chat (2026-08-16). */
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

/** One future slot as seen from a topic's demand (topic-workbench,
 * 2026-08-14; v2 same day — pencils are location-less time-intents, so no
 * location fields): the topic's hearters' availability, both as counts
 * (the wash) and per hearter (the avatar fold — the caller is the topic's
 * own host or an admin, exactly who may see per-elector availability). */
type TopicSlotFitRow = {
  slotId: string;
  startsAt: Date;
  endsAt: Date;
  /** This topic's own pencil here, for unpencilling. */
  sessionId: string | null;
  topicStatus: string | null;
  counts: { green: number; yellow: number; red: number };
  perUser: {
    userId: string;
    name: string | null;
    image: string | null;
    state: string;
  }[];
  /** Who ELSE is here (QA 2026-08-15): pencils never contend, but a host
   * choosing when to run their topic wants to see the company — and a
   * confirmed session means the room race has already started. */
  others: { id: string; label: string; status: string }[];
  /** The slot's own discussion, which the workbench row unfolds just like
   * a calendar row (QA 2026-08-16) — one conversation per timeslot,
   * wherever you meet it. */
  commentCount: number;
};

/** One other booking on a workbench row — display copy only (no links,
 * no ids beyond the key), since the workbench is a dashboard. */
const TopicSlotOtherType = builder
  .objectRef<{ id: string; label: string; status: string }>("TopicSlotOther")
  .implement({
    fields: (t) => ({
      id: t.exposeID("id"),
      /** "Ann Kelly: Quantum ethics", "Hannah — Office hours", or an
       * admin custom title. */
      label: t.exposeString("label"),
      /** proposed (pencilled) | confirmed. */
      status: t.exposeString("status"),
    }),
  });

const TopicSlotFitType = builder
  .objectRef<TopicSlotFitRow>("TopicSlotFit")
  .implement({
    fields: (t) => ({
      slotId: t.exposeID("slotId"),
      startsAt: t.string({ resolve: (s) => s.startsAt.toISOString() }),
      endsAt: t.string({ resolve: (s) => s.endsAt.toISOString() }),
      /** This topic's own booking here, if any: proposed | confirmed. */
      sessionId: t.exposeID("sessionId", { nullable: true }),
      topicStatus: t.exposeString("topicStatus", { nullable: true }),
      counts: t.field({
        type: AvailabilityCountsType,
        resolve: (s) => s.counts,
      }),
      perUser: t.field({
        type: [SlotAvailabilityType],
        resolve: (s) => s.perUser,
      }),
      others: t.field({
        type: [TopicSlotOtherType],
        resolve: (s) => s.others,
      }),
      commentCount: t.exposeInt("commentCount"),
    }),
  });

const TopicScheduleType = builder
  .objectRef<{
    hearterCount: number;
    slots: TopicSlotFitRow[];
  }>("TopicSchedule")
  .implement({
    fields: (t) => ({
      hearterCount: t.exposeInt("hearterCount"),
      slots: t.field({ type: [TopicSlotFitType], resolve: (s) => s.slots }),
    }),
  });

/** One future slot on a topic card's sessions tab (2026-08-14): public
 * session facts plus the viewer's OWN availability. Group counts/perUser
 * are deliberately never exposed here — whether electors may see group
 * availability is a deferred privacy question. */
const TopicSessionType = builder
  .objectRef<TopicSessionRow>("TopicSession")
  .implement({
    fields: (t) => ({
      slotId: t.exposeID("slotId"),
      startsAt: t.string({ resolve: (s) => s.startsAt.toISOString() }),
      endsAt: t.string({ resolve: (s) => s.endsAt.toISOString() }),
      /** proposed (pencilled) | confirmed. */
      status: t.exposeString("status"),
      /** Display copy — empty on location-less pencils. */
      location: t.exposeString("location"),
      /** The viewer's own 🟢🟡🔴 answer; null when signed out. */
      viewerState: t.exposeString("viewerState", { nullable: true }),
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

  /** Slot discussion thread (any member; admins also see hidden). */
  slotComments: t.field({
    type: [SlotCommentType],
    args: { slotId: t.arg.string({ required: true }) },
    resolve: async (_p, args, ctx) => {
      const { viewer, timetable } = await loadSlotAndViewer(ctx, args.slotId);
      if (!isCalendarEnabled(timetable.settings)) return [];
      if (!canDiscussSlots(viewer)) return [];
      const comments = await listSlotComments(args.slotId, {
        includeHidden: canManageCalendar(viewer),
      });
      // Claim snapshots carry group availability, so they answer to the
      // same gate as the live counts (2026-08-16).
      if (canSeeHostOnly(viewer)) return comments;
      return comments.map((c) => ({ ...c, counts: null }));
    },
  }),

  /** The topic-workbench feed (My Topics, 2026-08-14): future slots scored
   * by THIS topic's hearters' availability — the calendar's audience-lens
   * math in a per-topic frame. Fetched lazily on panel expand. Null for
   * anyone but the topic's own host or an admin (the
   * topicWeightedBreakdown null-for-unauthorized precedent). */
  topicSlotFit: t.field({
    type: TopicScheduleType,
    nullable: true,
    args: {
      idOrSlug: t.arg.string({ required: true }),
      topicId: t.arg.string({ required: true }),
    },
    resolve: async (_p, args, ctx) => {
      if (!ctx.user) return null;
      const readable = await readTimetable(ctx, args.idOrSlug);
      if (!readable) return null;
      if (!isCalendarEnabled(readable.timetable.settings)) return null;
      const topic = await getTopicById(args.topicId);
      if (!topic || topic.timetableId !== readable.timetable.id) return null;
      const viewer = { userId: ctx.user.id, roles: readable.roles };
      if (!isAdmin(readable.roles) && topic.hostId !== viewer.userId) {
        return null;
      }
      const hearters = await getAudienceElectorIds(readable.timetable.id, {
        kind: "hearted_topic",
        topicId: topic.id,
      });
      const slots = await buildCalendar(
        readable.timetable.id,
        hearters,
        ctx.user.id,
      );
      const ohLabel = officeHoursLabel(readable.timetable.settings);
      return {
        hearterCount: hearters.length,
        slots: slots.map((s) => {
          const own = s.sessions.find((x) => x.topic?.id === topic.id);
          return {
            slotId: s.id,
            startsAt: s.startsAt,
            endsAt: s.endsAt,
            sessionId: own?.id ?? null,
            topicStatus: own?.status ?? null,
            counts: s.counts,
            perUser: s.perUser ?? [],
            others: s.sessions
              .filter((x) => x.id !== own?.id)
              .map((x) => ({
                id: x.id,
                label: x.topic
                  ? `${x.topic.hostName ?? "…"}: ${x.topic.title}`
                  : x.customTitle ||
                    `${x.sessionHost?.name ?? "…"} — ${ohLabel}`,
                status: x.status,
              })),
            commentCount: s.commentCount,
          };
        }),
      };
    },
  }),

  /** The sessions tab (2026-08-14): every future slot where this topic is
   * pencilled or confirmed — for ANY viewer who can see the card (sessions
   * are public on the calendar page); anonymous viewers of a readable
   * forum DO get rows, with viewerState null. Null when gated
   * (topicWeightedBreakdown precedent): unreadable forum / calendar off /
   * foreign or unpublished topic. */
  topicSessions: t.field({
    type: [TopicSessionType],
    nullable: true,
    args: {
      idOrSlug: t.arg.string({ required: true }),
      topicId: t.arg.string({ required: true }),
    },
    resolve: async (_p, args, ctx) => {
      const readable = await readTimetable(ctx, args.idOrSlug);
      if (!readable) return null;
      if (!isCalendarEnabled(readable.timetable.settings)) return null;
      const topic = await getTopicById(args.topicId);
      if (!topic || topic.timetableId !== readable.timetable.id) return null;
      if (topic.status !== "published") return null;
      return listTopicSessions(
        readable.timetable.id,
        topic.id,
        ctx.user?.id ?? null,
      );
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

const CreateSlotsResultType = builder
  .objectRef<{ created: number; augmented: number }>("CreateSlotsResult")
  .implement({
    fields: (t) => ({
      created: t.exposeInt("created"),
      /** Existing same-time slots that gained locations (aggregation). */
      augmented: t.exposeInt("augmented"),
    }),
  });

builder.mutationFields((t) => ({
  /** Admin: bulk-create slots (pattern × terms generation, or one slot).
   * Slots aggregate per time window — a same-time input adds its locations
   * to the existing slot, and exact (time, location) duplicates are
   * skipped — so regeneration is idempotent. */
  createTimeslots: t.field({
    type: CreateSlotsResultType,
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
      const { created, augmented } = await createSlots(
        readable.timetable.id,
        inputs,
      );
      if (created.length > 0 || augmented > 0) {
        const parts = [
          created.length > 0
            ? `${created.length} slot${created.length === 1 ? "" : "s"} generated`
            : null,
          augmented > 0
            ? `${augmented} slot${augmented === 1 ? "" : "s"} gained locations`
            : null,
        ].filter(Boolean);
        await logActivity({
          timetableId: readable.timetable.id,
          actorId: ctx.user?.id ?? null,
          action: "calendar.schedule",
          note: parts.join(", "),
        });
      }
      return { created: created.length, augmented };
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
      /** Offered at the new slot (slot-level; the session stays
       * location-less — the room is decided at confirm time). */
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
      // Off-piste proposals are always a person's session (topic or office
      // hours — no custom subject), so sessionHostId is always set.
      const subject = await resolveSessionSubject(
        viewer,
        readable.timetable,
        args.topicId,
        args.sessionHostId,
        "",
      );
      const { startsAt, endsAt } = parseSlotWindow(args.startsAt, args.endsAt);
      // The location is the SLOT's — it joins the new timeslot's offered
      // set — while the session itself is born location-less (the room is
      // decided at confirm time, 2026-08-14).
      const location = (args.location ?? "").trim();
      const { slot } = await proposeSlot(readable.timetable.id, user.id, {
        startsAt,
        endsAt,
        location,
        topicId: subject.topicId,
        sessionHostId: subject.sessionHostId!,
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

  /** Admin: update a timeslot's time window and/or offered locations. */
  updateTimeslot: t.field({
    type: "Boolean",
    args: {
      slotId: t.arg.string({ required: true }),
      startsAt: t.arg.string({ required: false }),
      endsAt: t.arg.string({ required: false }),
      /** JSON array of offered locations; at least one when provided. */
      locationsJson: t.arg.string({ required: false }),
    },
    resolve: async (_p, args, ctx) => {
      await requireUser(ctx);
      const { slot, viewer, timetable } = await loadSlotAndViewer(
        ctx,
        args.slotId,
      );
      requireCalendarEnabled(timetable.settings);
      if (!canManageCalendar(viewer)) forbidden("Admins only");
      let locations: string[] | undefined;
      if (args.locationsJson != null) {
        let parsed: unknown;
        try {
          parsed = JSON.parse(args.locationsJson);
        } catch {
          badRequest("Invalid locations JSON");
        }
        locations = parseSlotLocations(parsed, "Slot");
        if (locations.length === 0) badRequest("Pick at least one location");
      }
      await updateSlot(slot.id, {
        startsAt: args.startsAt ? new Date(args.startsAt) : undefined,
        endsAt: args.endsAt ? new Date(args.endsAt) : undefined,
        locations,
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
  sessionHostId: string | null;
  /** Admin custom session title ("" otherwise). */
  customTitle: string;
  /** Extra activity payload — topicId+title auto-link the timeline. */
  payloadExtra: Record<string, unknown>;
  /** Office hours: the forum's label rides as the activity note. */
  note: string | null;
};

/** Validate a session subject — a topic, office hours for a host, or an
 * admin's custom title — and derive the ownership column + activity-log
 * fields for it. */
async function resolveSessionSubject(
  viewer: Viewer,
  timetable: { id: string; settings: TimetableSettings },
  topicIdArg: string | null | undefined,
  sessionHostIdArg: string | null | undefined,
  customTitle: string,
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
      customTitle: "",
      payloadExtra: { topicId: topic.id, title: topic.title },
      note: null,
    };
  }
  if (sessionHostIdArg != null) {
    await assertOfficeHoursHost(viewer, sessionHostIdArg, timetable.id);
    return {
      topicId: null,
      sessionHostId: sessionHostIdArg,
      customTitle: "",
      payloadExtra: {},
      note: officeHoursLabel(timetable.settings),
    };
  }
  if (!customTitle) {
    badRequest("Pick a topic session, office hours, or a custom title");
  }
  // Custom sessions ("Departmental seminar") are admin-only: no owner
  // column, so the never-displace rule can't protect them — the admin
  // gates (here and on the existing booking) do.
  if (!canManageCalendar(viewer)) {
    forbidden("Custom sessions are admin-only");
  }
  return {
    topicId: null,
    sessionHostId: null,
    customTitle,
    payloadExtra: { title: customTitle },
    note: null,
  };
}

/** A booking loaded with its slot, forum, and viewer, plus the derived
 * ownership + activity fields shared by update/clear. */
async function loadSessionForWrite(
  ctx: Parameters<typeof loadSlotAndViewer>[0],
  sessionId: string,
) {
  const session = await getSlotSessionById(sessionId);
  if (!session) notFound("Session not found");
  const { slot, viewer, timetable } = await loadSlotAndViewer(
    ctx,
    session.slotId,
  );
  requireCalendarEnabled(timetable.settings);
  const topic = session.topicId ? await getTopicById(session.topicId) : null;
  // sessionHostId is THE ownership column; legacy rows fall back to the
  // topic's host. Custom sessions have no owner — admin-gated below.
  const owner = session.sessionHostId ?? topic?.hostId ?? null;
  if (!canTouchSlotSession(viewer, owner)) {
    forbidden("Another host's session is booked here");
  }
  if (session.customTitle !== "" && !canManageCalendar(viewer)) {
    forbidden("An admin's custom session is booked here");
  }
  return { session, slot, viewer, timetable, topic };
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

/** updateSlotSession's write path: parse the url/location args
 * (null=unchanged, ""=clear), guard the confirm-time location rule — a
 * confirmed session's non-empty location must not be held by another
 * confirmed session in the slot — and persist. Returns the session's
 * effective location (for the activity log). */
async function persistSessionUpdate(
  session: { id: string; location: string },
  slot: { id: string },
  status: SlotStatus,
  args: { url: string | null | undefined; location: string | null | undefined },
): Promise<string> {
  const location =
    args.location == null ? undefined : parseSessionLocation(args.location);
  const nextLocation = location ?? session.location;
  if (
    status === "confirmed" &&
    nextLocation &&
    (await confirmedLocationTaken(slot.id, nextLocation, session.id))
  ) {
    badRequest("That location is already confirmed for this time");
  }
  try {
    await updateSlotSessionRow(session.id, {
      status,
      url: args.url === undefined ? undefined : parseSessionUrl(args.url),
      location,
    });
  } catch (err) {
    // The pre-flight can race a concurrent confirm; the partial unique
    // index backstops it — same friendly error.
    if (isConfirmedLocationConflict(err)) {
      badRequest("That location is already confirmed for this time");
    }
    throw err;
  }
  return nextLocation;
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
  /** Book a session into a slot — a topic, (QA 2026-08-03) office hours
   * for `sessionHostId`, or an admin's custom `title`. Pencils are
   * location-less time-intents (2026-08-14): any number of subjects can
   * share a slot — a pencil is the host saying "I am available at this
   * time" — and the only exclusivity is one pencil per subject per slot;
   * the room is decided at confirm time (updateSlotSession). Who may do
   * what depends on the forum's confirm policy. */
  addSlotSession: t.field({
    type: "Boolean",
    args: {
      slotId: t.arg.string({ required: true }),
      topicId: t.arg.string({ required: false }),
      /** Office hours: the host the session is for (topicId omitted). */
      sessionHostId: t.arg.string({ required: false }),
      /** Admin custom session (both ids omitted). */
      title: t.arg.string({ required: false }),
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
      const status = parseSessionStatus(args.status);
      assertStatusGate(viewer, policy, status);

      const subject = await resolveSessionSubject(
        viewer,
        timetable,
        args.topicId,
        args.sessionHostId,
        parseCustomTitle(args.title),
      );
      if (
        (subject.topicId || subject.sessionHostId) &&
        (await slotSubjectTaken(slot.id, subject))
      ) {
        badRequest("Already pencilled in at this time");
      }
      await addSlotSession(slot.id, {
        topicId: subject.topicId,
        sessionHostId: subject.sessionHostId,
        customTitle: subject.customTitle,
        status,
        url: parseSessionUrl(args.url),
        createdById: user.id,
      });
      await logActivity({
        timetableId: timetable.id,
        actorId: user.id,
        action: status === "confirmed" ? "slot.confirm" : "slot.pencil",
        payload: {
          slotId: slot.id,
          startsAt: slot.startsAt.toISOString(),
          ...subject.payloadExtra,
        },
        ...(subject.note ? { note: subject.note } : {}),
      });
      return true;
    },
  }),

  /** Confirm a booking / edit its URL or location. Owner or admin only;
   * custom sessions are admin-only. The room is decided here (2026-08-14):
   * `location` follows the null=unchanged / ""=clear convention, and a
   * confirmed session's non-empty location must be free — confirmed
   * sessions are exclusive per (slot, location). The location itself is
   * never required server-side (location-free forums confirm without
   * one); the UI enforces the pick when the slot offers locations. */
  updateSlotSession: t.field({
    type: "Boolean",
    args: {
      sessionId: t.arg.string({ required: true }),
      status: t.arg.string({ required: false }),
      url: t.arg.string({ required: false }),
      location: t.arg.string({ required: false }),
    },
    resolve: async (_p, args, ctx) => {
      const user = await requireUser(ctx);
      const { session, slot, viewer, timetable, topic } =
        await loadSessionForWrite(ctx, args.sessionId);
      const policy = calendarConfirmPolicy(timetable.settings);
      const status = parseSessionStatus(args.status ?? session.status);
      assertStatusGate(viewer, policy, status);

      const nextLocation = await persistSessionUpdate(session, slot, status, {
        url: args.url,
        location: args.location,
      });
      // Re-confirming (e.g. a URL edit) still logs slot.confirm — the log
      // is a feed, and the fresh URL is the news.
      await logActivity({
        timetableId: timetable.id,
        actorId: user.id,
        action: status === "confirmed" ? "slot.confirm" : "slot.pencil",
        payload: {
          slotId: slot.id,
          startsAt: slot.startsAt.toISOString(),
          ...(nextLocation ? { location: nextLocation } : {}),
          ...(topic
            ? { topicId: topic.id, title: topic.title }
            : session.customTitle
              ? { title: session.customTitle }
              : {}),
        },
        ...(topic || session.customTitle
          ? {}
          : { note: officeHoursLabel(timetable.settings) }),
      });
      return true;
    },
  }),

  /** Un-pencil a booking. Owner or admin only; the timeslot stays. */
  clearSlotSession: t.field({
    type: "Boolean",
    args: { sessionId: t.arg.string({ required: true }) },
    resolve: async (_p, args, ctx) => {
      const user = await requireUser(ctx);
      const { session, slot, viewer, timetable, topic } =
        await loadSessionForWrite(ctx, args.sessionId);
      const policy = calendarConfirmPolicy(timetable.settings);
      if (!canProposeSession(viewer, policy)) forbidden();

      await deleteSlotSessionRow(session.id);
      await logActivity({
        timetableId: timetable.id,
        actorId: user.id,
        action: "slot.clear",
        payload: {
          slotId: slot.id,
          startsAt: slot.startsAt.toISOString(),
          ...(session.location ? { location: session.location } : {}),
          ...(topic
            ? { topicId: topic.id, title: topic.title }
            : session.customTitle
              ? { title: session.customTitle }
              : {}),
        },
        ...(topic || session.customTitle
          ? {}
          : { note: officeHoursLabel(timetable.settings) }),
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

  /** Any member: post to a slot discussion. Hosts/admins may optionally post
   * a session claim carrying a topic and the availability snapshot the server
   * computes for that topic's hearters at this moment. */
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
      if (!canDiscussSlots(viewer)) forbidden("Members only");
      if (args.topicId && !canSeeHostOnly(viewer)) {
        forbidden("Attaching a topic snapshot is host/admin-only");
      }
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
