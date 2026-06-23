import { and, asc, eq, inArray, sql } from "drizzle-orm";

import {
  availability,
  db,
  hearts,
  slotComments,
  slotTopics,
  timeslots,
  timetableMemberships,
  topics,
  users,
  type AvailabilityState,
  type SlotComment,
  type Timeslot,
} from "@timetable/db";

// --------------------------------------------------------------------------
// Slot CRUD (admin)
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
};

export async function createSlots(
  timetableId: string,
  inputs: SlotInput[],
): Promise<Timeslot[]> {
  if (inputs.length === 0) return [];
  return db
    .insert(timeslots)
    .values(
      inputs.map((s) => ({
        timetableId,
        startsAt: s.startsAt,
        endsAt: s.endsAt,
        location: s.location ?? "",
      })),
    )
    .returning();
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

export async function deleteSlot(slotId: string): Promise<void> {
  await db.delete(timeslots).where(eq(timeslots.id, slotId));
}

export async function listSlots(timetableId: string): Promise<Timeslot[]> {
  return db
    .select()
    .from(timeslots)
    .where(eq(timeslots.timetableId, timetableId))
    .orderBy(asc(timeslots.startsAt));
}

export type IcsSlot = {
  id: string;
  startsAt: Date;
  endsAt: Date;
  location: string;
  topicTitles: string[];
};

/** Slots with their tagged topic titles, for the ICS calendar feed. */
export async function getSlotsForIcs(timetableId: string): Promise<IcsSlot[]> {
  const slots = await listSlots(timetableId);
  if (slots.length === 0) return [];
  const slotIds = slots.map((s) => s.id);

  const tagRows = await db
    .select({ slotId: slotTopics.slotId, title: topics.title })
    .from(slotTopics)
    .innerJoin(topics, eq(topics.id, slotTopics.topicId))
    .where(inArray(slotTopics.slotId, slotIds));

  const titlesBySlot = new Map<string, string[]>();
  for (const r of tagRows) {
    const list = titlesBySlot.get(r.slotId) ?? [];
    list.push(r.title);
    titlesBySlot.set(r.slotId, list);
  }

  return slots.map((s) => ({
    id: s.id,
    startsAt: s.startsAt,
    endsAt: s.endsAt,
    location: s.location,
    topicTitles: titlesBySlot.get(s.id) ?? [],
  }));
}

// --------------------------------------------------------------------------
// Availability (elector)
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

/** Set availability for every slot on a given UTC weekday (0=Sun..6=Sat). */
export async function setWeekdayAvailability(
  timetableId: string,
  userId: string,
  weekday: number,
  state: AvailabilityState,
): Promise<number> {
  const slots = await listSlots(timetableId);
  const matching = slots.filter((s) => s.startsAt.getUTCDay() === weekday);
  for (const slot of matching) {
    await setAvailability(slot.id, userId, state);
  }
  return matching.length;
}

// --------------------------------------------------------------------------
// Slot discussion (host/admin) and topic tagging
// --------------------------------------------------------------------------

export async function listSlotComments(slotId: string): Promise<
  { id: string; authorId: string; authorName: string | null; body: string; createdAt: Date }[]
> {
  const rows = await db
    .select({
      id: slotComments.id,
      authorId: slotComments.authorId,
      authorName: users.name,
      body: slotComments.body,
      createdAt: slotComments.createdAt,
    })
    .from(slotComments)
    .innerJoin(users, eq(users.id, slotComments.authorId))
    .where(eq(slotComments.slotId, slotId))
    .orderBy(asc(slotComments.createdAt));
  return rows;
}

export async function addSlotComment(
  slotId: string,
  authorId: string,
  body: string,
): Promise<SlotComment> {
  const [comment] = await db
    .insert(slotComments)
    .values({ slotId, authorId, body })
    .returning();
  if (!comment) throw new Error("Failed to add slot comment");
  return comment;
}

export async function tagSlotTopic(
  slotId: string,
  topicId: string,
): Promise<void> {
  // The topic and slot must belong to the same timetable.
  const [slot] = await db
    .select({ timetableId: timeslots.timetableId })
    .from(timeslots)
    .where(eq(timeslots.id, slotId))
    .limit(1);
  const [topic] = await db
    .select({ timetableId: topics.timetableId })
    .from(topics)
    .where(eq(topics.id, topicId))
    .limit(1);
  if (!slot || !topic || slot.timetableId !== topic.timetableId) {
    throw new Error("Topic and slot must belong to the same timetable");
  }
  await db.insert(slotTopics).values({ slotId, topicId }).onConflictDoNothing();
}

export async function untagSlotTopic(
  slotId: string,
  topicId: string,
): Promise<void> {
  await db
    .delete(slotTopics)
    .where(and(eq(slotTopics.slotId, slotId), eq(slotTopics.topicId, topicId)));
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
  topics: { id: string; title: string }[];
  viewerState: AvailabilityState | null;
  counts: { green: number; yellow: number; red: number };
  perUser: { userId: string; name: string | null; state: AvailabilityState }[];
  commentCount: number;
};

/**
 * Build the calendar for a timetable. Aggregate counts and per-user rows are
 * limited to `audienceIds` (the resolved audience). `perUser` should only be
 * surfaced to hosts/admins by the caller.
 */
export async function buildCalendar(
  timetableId: string,
  audienceIds: string[],
  viewerUserId: string | null,
): Promise<CalendarSlot[]> {
  const slots = await listSlots(timetableId);
  if (slots.length === 0) return [];
  const slotIds = slots.map((s) => s.id);

  const availRows = await db
    .select({
      slotId: availability.slotId,
      userId: availability.userId,
      state: availability.state,
    })
    .from(availability)
    .where(inArray(availability.slotId, slotIds));

  // Names for the whole audience (including electors who never saved a row).
  const audienceNameById = new Map<string, string | null>();
  if (audienceIds.length > 0) {
    const nameRows = await db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(inArray(users.id, audienceIds));
    for (const u of nameRows) audienceNameById.set(u.id, u.name);
  }

  const tagRows = await db
    .select({
      slotId: slotTopics.slotId,
      topicId: slotTopics.topicId,
      title: topics.title,
    })
    .from(slotTopics)
    .innerJoin(topics, eq(topics.id, slotTopics.topicId))
    .where(inArray(slotTopics.slotId, slotIds));

  const commentRows = await db
    .select({
      slotId: slotComments.slotId,
      n: sql<number>`count(*)::int`,
    })
    .from(slotComments)
    .where(inArray(slotComments.slotId, slotIds))
    .groupBy(slotComments.slotId);

  const tagsBySlot = new Map<string, { id: string; title: string }[]>();
  for (const t of tagRows) {
    const list = tagsBySlot.get(t.slotId) ?? [];
    list.push({ id: t.topicId, title: t.title });
    tagsBySlot.set(t.slotId, list);
  }

  const commentCountBySlot = new Map<string, number>();
  for (const c of commentRows) commentCountBySlot.set(c.slotId, c.n);

  return slots.map((slot) => {
    const stateByUser = new Map<string, AvailabilityState>();
    for (const r of availRows) {
      if (r.slotId === slot.id) stateByUser.set(r.userId, r.state);
    }

    const viewerState = viewerUserId
      ? (stateByUser.get(viewerUserId) ?? null)
      : null;

    // Availability defaults to yellow, so audience electors without a saved
    // row still count as yellow.
    const counts = { green: 0, yellow: 0, red: 0 };
    const perUser: CalendarSlot["perUser"] = [];
    for (const uid of audienceIds) {
      const state = stateByUser.get(uid) ?? "yellow";
      counts[state] += 1;
      perUser.push({
        userId: uid,
        name: audienceNameById.get(uid) ?? null,
        state,
      });
    }

    return {
      id: slot.id,
      startsAt: slot.startsAt,
      endsAt: slot.endsAt,
      location: slot.location,
      topics: tagsBySlot.get(slot.id) ?? [],
      viewerState,
      counts,
      perUser,
      commentCount: commentCountBySlot.get(slot.id) ?? 0,
    };
  });
}
