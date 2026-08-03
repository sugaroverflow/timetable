import {
  and,
  asc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lte,
  sql,
} from "drizzle-orm";

import {
  availability,
  availabilityPatterns,
  db,
  hearts,
  slotComments,
  timeslots,
  timetableMemberships,
  topics,
  type AvailabilityState,
  type SlotComment,
  type SlotStatus,
  type Timeslot,
} from "@timetable/db";

// --------------------------------------------------------------------------
// Slot CRUD
// --------------------------------------------------------------------------

export async function getSlotById(slotId: string): Promise<Timeslot | null> {
  const [slot] = await db
    .select()
    .from(timeslots)
    .where(eq(timeslots.id, slotId))
    .limit(1);
  return slot ?? null;
}

export type SlotInput = {
  startsAt: Date;
  endsAt: Date;
  location?: string;
  /** Pattern-cell provenance "{weekday}-{HH:MM}" for generated slots. */
  cellKey?: string | null;
};

/** Admin bulk-create (single slots and pattern × terms generation both land
 * here). Exact duplicates — same start/end/location — are skipped so
 * re-running "Generate slots" after adding a term is idempotent. */
export async function createSlots(
  timetableId: string,
  inputs: SlotInput[],
): Promise<Timeslot[]> {
  if (inputs.length === 0) return [];
  const existing = await listSlots(timetableId, { includePast: true });
  const seen = new Set(
    existing.map(
      (s) => `${s.startsAt.getTime()}|${s.endsAt.getTime()}|${s.location}`,
    ),
  );
  const fresh = inputs.filter(
    (s) =>
      !seen.has(
        `${s.startsAt.getTime()}|${s.endsAt.getTime()}|${s.location ?? ""}`,
      ),
  );
  if (fresh.length === 0) return [];
  return db
    .insert(timeslots)
    .values(
      fresh.map((s) => ({
        timetableId,
        startsAt: s.startsAt,
        endsAt: s.endsAt,
        location: s.location ?? "",
        cellKey: s.cellKey ?? null,
      })),
    )
    .returning();
}

/** A host's off-piste slot: born `proposed` with their topic attached —
 * or, with topicId null, an office-hours session owned by sessionHostId. */
export async function proposeSlot(
  timetableId: string,
  createdById: string,
  input: SlotInput & { topicId: string | null; sessionHostId: string },
): Promise<Timeslot> {
  const [slot] = await db
    .insert(timeslots)
    .values({
      timetableId,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      location: input.location ?? "",
      status: "proposed",
      topicId: input.topicId,
      sessionHostId: input.sessionHostId,
      createdById,
    })
    .returning();
  if (!slot) throw new Error("Failed to propose slot");
  return slot;
}

export async function updateSlot(
  slotId: string,
  patch: { startsAt?: Date; endsAt?: Date; location?: string },
): Promise<Timeslot | null> {
  const [updated] = await db
    .update(timeslots)
    .set({
      ...(patch.startsAt ? { startsAt: patch.startsAt } : {}),
      ...(patch.endsAt ? { endsAt: patch.endsAt } : {}),
      ...(patch.location !== undefined ? { location: patch.location } : {}),
      updatedAt: new Date(),
    })
    .where(eq(timeslots.id, slotId))
    .returning();
  return updated ?? null;
}

/** Set a slot's session: topic (or office-hours host) + status + url
 * together. Both ids null clears the session back to empty (url cleared
 * too). `sessionHostId` is the ownership column: the topic's host for
 * topic sessions, the host themselves for office hours. Permission rules
 * (confirm policy, never-displace) live in the resolver. */
export async function setSlotSession(
  slotId: string,
  session: {
    topicId: string | null;
    sessionHostId: string | null;
    status?: SlotStatus;
    url?: string;
  },
): Promise<Timeslot | null> {
  const clearing = session.topicId === null && session.sessionHostId === null;
  const [updated] = await db
    .update(timeslots)
    .set({
      topicId: session.topicId,
      sessionHostId: session.sessionHostId,
      status: clearing ? "empty" : (session.status ?? "proposed"),
      url: clearing ? "" : (session.url ?? ""),
      updatedAt: new Date(),
    })
    .where(eq(timeslots.id, slotId))
    .returning();
  return updated ?? null;
}

export async function deleteSlot(slotId: string): Promise<void> {
  await db.delete(timeslots).where(eq(timeslots.id, slotId));
}

export async function listSlots(
  timetableId: string,
  opts: { includePast?: boolean; now?: Date } = {},
): Promise<Timeslot[]> {
  const now = opts.now ?? new Date();
  return db
    .select()
    .from(timeslots)
    .where(
      and(
        eq(timeslots.timetableId, timetableId),
        // gte, not a raw sql template: template params bypass the column's
        // Date mapping and threw at runtime on hosted Postgres (dev QA
        // 2026-07-31).
        opts.includePast ? undefined : gte(timeslots.endsAt, now),
      ),
    )
    .orderBy(asc(timeslots.startsAt));
}

/** Whether the forum has any slots at all (past included) — gates the
 * calendar nav link/page for non-admins until the schedule exists
 * (QA 2026-08-03). */
export async function forumHasSlots(timetableId: string): Promise<boolean> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(timeslots)
    .where(eq(timeslots.timetableId, timetableId));
  return (row?.n ?? 0) > 0;
}

export type IcsSlot = {
  id: string;
  startsAt: Date;
  endsAt: Date;
  location: string;
  status: SlotStatus;
  url: string;
  topicTitle: string | null;
  /** Office-hours sessions: the host's per-forum name. */
  sessionHostName: string | null;
};

/** Slots with their session, for the ICS calendar feed (upcoming + past —
 * calendar apps handle history themselves). */
export async function getSlotsForIcs(timetableId: string): Promise<IcsSlot[]> {
  const rows = await db
    .select({
      id: timeslots.id,
      startsAt: timeslots.startsAt,
      endsAt: timeslots.endsAt,
      location: timeslots.location,
      status: timeslots.status,
      url: timeslots.url,
      topicId: timeslots.topicId,
      topicTitle: topics.title,
      sessionHostName: timetableMemberships.name,
    })
    .from(timeslots)
    .leftJoin(topics, eq(topics.id, timeslots.topicId))
    .leftJoin(
      timetableMemberships,
      and(
        eq(timetableMemberships.userId, timeslots.sessionHostId),
        eq(timetableMemberships.timetableId, timeslots.timetableId),
      ),
    )
    .where(eq(timeslots.timetableId, timetableId))
    .orderBy(asc(timeslots.startsAt));
  return rows.map((r) => ({
    id: r.id,
    startsAt: r.startsAt,
    endsAt: r.endsAt,
    location: r.location,
    status: r.status,
    url: r.url,
    topicTitle: r.topicTitle,
    sessionHostName: r.topicId ? null : r.sessionHostName,
  }));
}

// --------------------------------------------------------------------------
// Availability: explicit per-slot answers + the weekly pattern
// --------------------------------------------------------------------------

export async function setAvailability(
  slotId: string,
  userId: string,
  state: AvailabilityState,
): Promise<void> {
  await db
    .insert(availability)
    .values({ slotId, userId, state })
    .onConflictDoUpdate({
      target: [availability.slotId, availability.userId],
      set: { state, updatedAt: new Date() },
    });
}

export type PatternCells = Record<string, AvailabilityState>;

export async function getAvailabilityPattern(
  timetableId: string,
  userId: string,
): Promise<PatternCells> {
  const [row] = await db
    .select({ cells: availabilityPatterns.cells })
    .from(availabilityPatterns)
    .where(
      and(
        eq(availabilityPatterns.timetableId, timetableId),
        eq(availabilityPatterns.userId, userId),
      ),
    )
    .limit(1);
  return row?.cells ?? {};
}

/** Replace the elector's whole weekly template (the grid saves atomically). */
export async function setAvailabilityPattern(
  timetableId: string,
  userId: string,
  cells: PatternCells,
): Promise<void> {
  await db
    .insert(availabilityPatterns)
    .values({ timetableId, userId, cells })
    .onConflictDoUpdate({
      target: [availabilityPatterns.timetableId, availabilityPatterns.userId],
      set: { cells, updatedAt: new Date() },
    });
}

/** Effective availability resolution (calendar v2): explicit answer on the
 * slot → the elector's pattern cell (generated slots only) → yellow.
 * "We use whatever availability information you share." */
export function resolveState(
  explicit: AvailabilityState | undefined,
  cellKey: string | null,
  pattern: PatternCells | undefined,
): AvailabilityState {
  if (explicit) return explicit;
  if (cellKey && pattern) {
    const fromPattern = pattern[cellKey];
    if (fromPattern) return fromPattern;
  }
  return "yellow";
}

async function loadPatternsByUser(
  timetableId: string,
  userIds: string[],
): Promise<Map<string, PatternCells>> {
  if (userIds.length === 0) return new Map();
  const rows = await db
    .select({
      userId: availabilityPatterns.userId,
      cells: availabilityPatterns.cells,
    })
    .from(availabilityPatterns)
    .where(
      and(
        eq(availabilityPatterns.timetableId, timetableId),
        inArray(availabilityPatterns.userId, userIds),
      ),
    );
  return new Map(rows.map((r) => [r.userId, r.cells]));
}

export type SlotCounts = { green: number; yellow: number; red: number };

/** Green/yellow/red counts for one slot across `audienceIds`, with pattern
 * inference — the snapshot attached to a session-claim comment. */
export async function computeSlotCounts(
  slot: Timeslot,
  audienceIds: string[],
): Promise<SlotCounts> {
  const counts: SlotCounts = { green: 0, yellow: 0, red: 0 };
  if (audienceIds.length === 0) return counts;
  const availRows = await db
    .select({ userId: availability.userId, state: availability.state })
    .from(availability)
    .where(eq(availability.slotId, slot.id));
  const explicit = new Map(availRows.map((r) => [r.userId, r.state]));
  const patterns = await loadPatternsByUser(slot.timetableId, audienceIds);
  for (const uid of audienceIds) {
    counts[resolveState(explicit.get(uid), slot.cellKey, patterns.get(uid))] +=
      1;
  }
  return counts;
}

// --------------------------------------------------------------------------
// Slot discussion (host/admin)
// --------------------------------------------------------------------------

export type SlotCommentView = {
  id: string;
  authorId: string;
  authorName: string | null;
  authorImage: string | null;
  /** The author's roles in the slot's forum (role pill next to the name);
   * empty for ex-members. */
  authorRoles: string[];
  body: string;
  topicId: string | null;
  topicTitle: string | null;
  counts: SlotCounts | null;
  editedAt: Date | null;
  hidden: boolean;
  createdAt: Date;
};

export async function listSlotComments(
  slotId: string,
  opts: { includeHidden?: boolean } = {},
): Promise<SlotCommentView[]> {
  // Author profile from their membership in the slot's timetable
  // (per-forum profiles); left join tolerates ex-members.
  const rows = await db
    .select({
      id: slotComments.id,
      authorId: slotComments.authorId,
      authorName: timetableMemberships.name,
      authorImage: timetableMemberships.image,
      authorRoles: timetableMemberships.roles,
      body: slotComments.body,
      topicId: slotComments.topicId,
      topicTitle: topics.title,
      greenCount: slotComments.greenCount,
      yellowCount: slotComments.yellowCount,
      redCount: slotComments.redCount,
      editedAt: slotComments.editedAt,
      hiddenAt: slotComments.hiddenAt,
      createdAt: slotComments.createdAt,
    })
    .from(slotComments)
    .innerJoin(timeslots, eq(timeslots.id, slotComments.slotId))
    .leftJoin(
      timetableMemberships,
      and(
        eq(timetableMemberships.userId, slotComments.authorId),
        eq(timetableMemberships.timetableId, timeslots.timetableId),
      ),
    )
    .leftJoin(topics, eq(topics.id, slotComments.topicId))
    .where(
      and(
        eq(slotComments.slotId, slotId),
        opts.includeHidden ? undefined : isNull(slotComments.hiddenAt),
      ),
    )
    .orderBy(asc(slotComments.createdAt));
  return rows.map((r) => ({
    id: r.id,
    authorId: r.authorId,
    authorName: r.authorName,
    authorImage: r.authorImage,
    authorRoles: r.authorRoles ?? [],
    body: r.body,
    topicId: r.topicId,
    topicTitle: r.topicTitle,
    counts:
      r.greenCount != null && r.yellowCount != null && r.redCount != null
        ? { green: r.greenCount, yellow: r.yellowCount, red: r.redCount }
        : null,
    editedAt: r.editedAt,
    hidden: r.hiddenAt != null,
    createdAt: r.createdAt,
  }));
}

export async function getSlotCommentById(
  commentId: string,
): Promise<SlotComment | null> {
  const [comment] = await db
    .select()
    .from(slotComments)
    .where(eq(slotComments.id, commentId))
    .limit(1);
  return comment ?? null;
}

/** Author edit: new body + the "(edited)" watermark. */
export async function updateSlotComment(
  commentId: string,
  body: string,
): Promise<void> {
  await db
    .update(slotComments)
    .set({ body, editedAt: new Date() })
    .where(eq(slotComments.id, commentId));
}

/** Author delete — hard: the thread is flat, so there is no reply
 * structure to tombstone for (unlike topic comments). */
export async function deleteSlotComment(commentId: string): Promise<void> {
  await db.delete(slotComments).where(eq(slotComments.id, commentId));
}

/** Admin moderation, mirroring topic comments' hide/unhide. */
export async function setSlotCommentHidden(
  commentId: string,
  hidden: boolean,
  byUserId: string,
): Promise<void> {
  await db
    .update(slotComments)
    .set(
      hidden
        ? { hiddenAt: new Date(), hiddenByUserId: byUserId }
        : { hiddenAt: null, hiddenByUserId: null },
    )
    .where(eq(slotComments.id, commentId));
}

export async function addSlotComment(
  slotId: string,
  authorId: string,
  body: string,
  claim?: { topicId: string; counts: SlotCounts },
): Promise<SlotComment> {
  const [comment] = await db
    .insert(slotComments)
    .values({
      slotId,
      authorId,
      body,
      ...(claim
        ? {
            topicId: claim.topicId,
            greenCount: claim.counts.green,
            yellowCount: claim.counts.yellow,
            redCount: claim.counts.red,
          }
        : {}),
    })
    .returning();
  if (!comment) throw new Error("Failed to add slot comment");
  return comment;
}

// --------------------------------------------------------------------------
// Audience resolution + calendar view
// --------------------------------------------------------------------------

export type Audience =
  | { kind: "all" }
  | { kind: "hearted_mine"; hostId: string }
  | { kind: "hearted_topic"; topicId: string };

/** Elector user ids that match the selected audience filter. */
export async function getAudienceElectorIds(
  timetableId: string,
  audience: Audience,
): Promise<string[]> {
  if (audience.kind === "all") {
    const rows = await db
      .select({ userId: timetableMemberships.userId })
      .from(timetableMemberships)
      .where(
        and(
          eq(timetableMemberships.timetableId, timetableId),
          sql`'elector' = ANY(${timetableMemberships.roles})`,
        ),
      );
    return rows.map((r) => r.userId);
  }

  if (audience.kind === "hearted_topic") {
    // Scope to this timetable so a foreign topic id can't pull in its electors.
    const rows = await db
      .select({ userId: hearts.userId })
      .from(hearts)
      .innerJoin(topics, eq(topics.id, hearts.topicId))
      .where(
        and(
          eq(hearts.topicId, audience.topicId),
          eq(topics.timetableId, timetableId),
        ),
      );
    return Array.from(new Set(rows.map((r) => r.userId)));
  }

  // hearted_mine: electors who hearted any published topic hosted by hostId.
  const rows = await db
    .select({ userId: hearts.userId })
    .from(hearts)
    .innerJoin(topics, eq(topics.id, hearts.topicId))
    .where(
      and(
        eq(topics.timetableId, timetableId),
        eq(topics.hostId, audience.hostId),
        eq(topics.status, "published"),
      ),
    );
  return Array.from(new Set(rows.map((r) => r.userId)));
}

export type CalendarSlot = {
  id: string;
  startsAt: Date;
  endsAt: Date;
  location: string;
  status: SlotStatus;
  url: string;
  cellKey: string | null;
  createdById: string | null;
  topic: {
    id: string;
    title: string;
    topicSlug: string | null;
    hostId: string;
    hostName: string | null;
  } | null;
  /** Office-hours sessions (topicId null): whose they are. */
  sessionHost: { id: string; name: string | null } | null;
  viewerState: AvailabilityState | null;
  counts: SlotCounts;
  perUser: {
    userId: string;
    name: string | null;
    image: string | null;
    state: AvailabilityState;
  }[];
  commentCount: number;
};

type SlotRelatedRows = {
  availRows: { slotId: string; userId: string; state: AvailabilityState }[];
  audienceProfiles: Map<string, { name: string | null; image: string | null }>;
  patterns: Map<string, PatternCells>;
  viewerPattern: PatternCells | undefined;
  topicsById: Map<
    string,
    {
      id: string;
      title: string;
      topicSlug: string | null;
      hostId: string;
      hostName: string | null;
    }
  >;
  sessionHostNames: Map<string, string | null>;
  commentCountBySlot: Map<string, number>;
};

async function loadSlotRelatedRows(
  timetableId: string,
  slots: Timeslot[],
  audienceIds: string[],
  viewerUserId: string | null,
): Promise<SlotRelatedRows> {
  const slotIds = slots.map((s) => s.id);

  const availRows = await db
    .select({
      slotId: availability.slotId,
      userId: availability.userId,
      state: availability.state,
    })
    .from(availability)
    .where(inArray(availability.slotId, slotIds));

  // Profiles for the whole audience (including electors who never saved a
  // row) — the host view shows avatars, so image comes along with name.
  const audienceProfiles = new Map<
    string,
    { name: string | null; image: string | null }
  >();
  if (audienceIds.length > 0) {
    const profileRows = await db
      .select({
        id: timetableMemberships.userId,
        name: timetableMemberships.name,
        image: timetableMemberships.image,
      })
      .from(timetableMemberships)
      .where(
        and(
          eq(timetableMemberships.timetableId, timetableId),
          inArray(timetableMemberships.userId, audienceIds),
        ),
      );
    for (const u of profileRows) {
      audienceProfiles.set(u.id, { name: u.name, image: u.image });
    }
  }

  const patternUserIds = [
    ...new Set([...audienceIds, ...(viewerUserId ? [viewerUserId] : [])]),
  ];
  const patterns = await loadPatternsByUser(timetableId, patternUserIds);

  const topicIds = [
    ...new Set(slots.map((s) => s.topicId).filter((id): id is string => !!id)),
  ];
  const topicsById = new Map<
    string,
    {
      id: string;
      title: string;
      topicSlug: string | null;
      hostId: string;
      hostName: string | null;
    }
  >();
  if (topicIds.length > 0) {
    // Host name from their per-forum membership profile (session lines
    // read "Author: Topic" — QA 2026-08-03); slug for the permalink.
    const topicRows = await db
      .select({
        id: topics.id,
        title: topics.title,
        topicSlug: topics.slug,
        hostId: topics.hostId,
        hostName: timetableMemberships.name,
      })
      .from(topics)
      .leftJoin(
        timetableMemberships,
        and(
          eq(timetableMemberships.userId, topics.hostId),
          eq(timetableMemberships.timetableId, timetableId),
        ),
      )
      .where(inArray(topics.id, topicIds));
    for (const t of topicRows) topicsById.set(t.id, t);
  }

  // Hidden comments stay out of the badge count (admins still see them
  // inside the fold).
  const commentRows = await db
    .select({
      slotId: slotComments.slotId,
      n: sql<number>`count(*)::int`,
    })
    .from(slotComments)
    .where(
      and(inArray(slotComments.slotId, slotIds), isNull(slotComments.hiddenAt)),
    )
    .groupBy(slotComments.slotId);

  // Office-hours sessions (no topic): the session host's per-forum name.
  const officeHoursHostIds = [
    ...new Set(
      slots
        .filter((s) => !s.topicId && s.sessionHostId)
        .map((s) => s.sessionHostId as string),
    ),
  ];
  const sessionHostNames = new Map<string, string | null>();
  if (officeHoursHostIds.length > 0) {
    const hostRows = await db
      .select({
        id: timetableMemberships.userId,
        name: timetableMemberships.name,
      })
      .from(timetableMemberships)
      .where(
        and(
          eq(timetableMemberships.timetableId, timetableId),
          inArray(timetableMemberships.userId, officeHoursHostIds),
        ),
      );
    for (const h of hostRows) sessionHostNames.set(h.id, h.name);
  }

  return {
    availRows,
    audienceProfiles,
    patterns,
    viewerPattern: viewerUserId ? patterns.get(viewerUserId) : undefined,
    topicsById,
    sessionHostNames,
    commentCountBySlot: new Map(commentRows.map((c) => [c.slotId, c.n])),
  };
}

/**
 * Build the calendar for a timetable. Aggregate counts and per-user rows are
 * limited to `audienceIds` (the resolved audience) and resolve through the
 * pattern layer. `perUser` should only be surfaced to hosts/admins by the
 * caller.
 */
export async function buildCalendar(
  timetableId: string,
  audienceIds: string[],
  viewerUserId: string | null,
  opts: { includePast?: boolean } = {},
): Promise<CalendarSlot[]> {
  const slots = await listSlots(timetableId, {
    includePast: opts.includePast,
  });
  if (slots.length === 0) return [];
  const related = await loadSlotRelatedRows(
    timetableId,
    slots,
    audienceIds,
    viewerUserId,
  );

  return slots.map((slot) =>
    toCalendarSlot(slot, related, audienceIds, viewerUserId),
  );
}

function slotAvailability(
  slot: Timeslot,
  related: SlotRelatedRows,
  audienceIds: string[],
  viewerUserId: string | null,
): Pick<CalendarSlot, "viewerState" | "counts" | "perUser"> {
  const explicitByUser = new Map<string, AvailabilityState>();
  for (const r of related.availRows) {
    if (r.slotId === slot.id) explicitByUser.set(r.userId, r.state);
  }

  const viewerState = viewerUserId
    ? resolveState(
        explicitByUser.get(viewerUserId),
        slot.cellKey,
        related.viewerPattern,
      )
    : null;

  const counts: SlotCounts = { green: 0, yellow: 0, red: 0 };
  const perUser: CalendarSlot["perUser"] = [];
  for (const uid of audienceIds) {
    const state = resolveState(
      explicitByUser.get(uid),
      slot.cellKey,
      related.patterns.get(uid),
    );
    counts[state] += 1;
    const profile = related.audienceProfiles.get(uid);
    perUser.push({
      userId: uid,
      name: profile?.name ?? null,
      image: profile?.image ?? null,
      state,
    });
  }
  return { viewerState, counts, perUser };
}

function toCalendarSlot(
  slot: Timeslot,
  related: SlotRelatedRows,
  audienceIds: string[],
  viewerUserId: string | null,
): CalendarSlot {
  return {
    id: slot.id,
    startsAt: slot.startsAt,
    endsAt: slot.endsAt,
    location: slot.location,
    status: slot.status,
    url: slot.url,
    cellKey: slot.cellKey,
    createdById: slot.createdById,
    topic: slot.topicId ? (related.topicsById.get(slot.topicId) ?? null) : null,
    sessionHost:
      !slot.topicId && slot.sessionHostId
        ? {
            id: slot.sessionHostId,
            name: related.sessionHostNames.get(slot.sessionHostId) ?? null,
          }
        : null,
    ...slotAvailability(slot, related, audienceIds, viewerUserId),
    commentCount: related.commentCountBySlot.get(slot.id) ?? 0,
  };
}

// --------------------------------------------------------------------------
// Digest feeds (calendar v2): upcoming confirmed sessions + availability
// asks for proposed sessions.
// --------------------------------------------------------------------------

export type DigestSession = {
  slotId: string;
  startsAt: Date;
  endsAt: Date;
  location: string;
  url: string;
  topicId: string;
  topicTitle: string;
  timetableId: string;
  /** Last session change — the digest's "new since last digest" signal. */
  updatedAt: Date;
};

/** Upcoming sessions with a topic in the given forums, one horizon for the
 * digest: confirmed → "Coming up", proposed → "Can you make it?" (the
 * caller filters the latter to topics the recipient hearted). */
export async function listUpcomingSessions(
  timetableIds: string[],
  status: SlotStatus,
  horizon: { from: Date; to: Date },
): Promise<DigestSession[]> {
  if (timetableIds.length === 0) return [];
  const rows = await db
    .select({
      slotId: timeslots.id,
      startsAt: timeslots.startsAt,
      endsAt: timeslots.endsAt,
      location: timeslots.location,
      url: timeslots.url,
      topicId: timeslots.topicId,
      topicTitle: topics.title,
      timetableId: timeslots.timetableId,
      updatedAt: timeslots.updatedAt,
    })
    .from(timeslots)
    .innerJoin(topics, eq(topics.id, timeslots.topicId))
    .where(
      and(
        inArray(timeslots.timetableId, timetableIds),
        eq(timeslots.status, status),
        isNotNull(timeslots.topicId),
        gte(timeslots.startsAt, horizon.from),
        lte(timeslots.startsAt, horizon.to),
      ),
    )
    .orderBy(asc(timeslots.startsAt));
  return rows.filter((r): r is DigestSession => r.topicId !== null);
}
