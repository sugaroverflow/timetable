import { and, eq, getTableColumns } from "drizzle-orm";

import {
  db,
  timetableMemberships,
  timetables,
  timetableSlugHistory,
  type Timetable,
} from "@timetable/db";
import {
  canReadTimetable,
  slugify,
  withRandomSuffix,
  type CreateTimetableInput,
  type Privacy,
  type Role,
} from "@timetable/shared";

import { createMembershipWithProfile } from "./members";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True when a slug is unavailable: live on any forum, or reserved by any
 * forum's history (old links must never start pointing elsewhere).
 * `forTimetableId` exempts that forum's own rows — its live slug isn't a
 * conflict with itself, and it may reclaim its own old slugs. */
async function slugTaken(
  slug: string,
  forTimetableId?: string,
): Promise<boolean> {
  const [live] = await db
    .select({ id: timetables.id })
    .from(timetables)
    .where(eq(timetables.slug, slug))
    .limit(1);
  if (live && live.id !== forTimetableId) return true;
  const [historical] = await db
    .select({ timetableId: timetableSlugHistory.timetableId })
    .from(timetableSlugHistory)
    .where(eq(timetableSlugHistory.slug, slug))
    .limit(1);
  return historical != null && historical.timetableId !== forTimetableId;
}

async function uniqueSlug(base: string): Promise<string> {
  let candidate = base;
  for (let attempt = 0; attempt < 6; attempt++) {
    if (!(await slugTaken(candidate))) return candidate;
    candidate = withRandomSuffix(base);
  }
  return withRandomSuffix(base);
}

/** Create a timetable and grant the creator owner + admin roles. */
export async function createTimetable(
  ownerId: string,
  input: CreateTimetableInput,
): Promise<Timetable> {
  const slug = await uniqueSlug(input.slug ?? slugify(input.name));

  const [timetable] = await db
    .insert(timetables)
    .values({
      name: input.name,
      slug,
      privacy: input.privacy ?? "private",
      ownerId,
    })
    .returning();

  if (!timetable) throw new Error("Failed to create timetable");

  // If seeding the owner membership fails (slug race, crash), the forum
  // must not survive ownerless — nobody could administer it (audit
  // 2026-08-17). Compensating delete rather than a transaction:
  // createMembershipWithProfile reads/writes through the shared `db`
  // handle, and the new row is invisible to everyone until membership
  // exists, so the window is harmless.
  try {
    await createMembershipWithProfile({
      userId: ownerId,
      timetableId: timetable.id,
      roles: ["owner", "admin"],
    });
  } catch (err) {
    await db.delete(timetables).where(eq(timetables.id, timetable.id));
    throw err;
  }

  return timetable;
}

/** Admin: update a timetable's profile, visibility, and custom domain. */
export async function updateTimetableProfile(
  timetableId: string,
  patch: {
    name?: string;
    privacy?: Privacy;
    customDomain?: string | null;
  },
): Promise<Timetable | null> {
  const [updated] = await db
    .update(timetables)
    .set({
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.privacy !== undefined ? { privacy: patch.privacy } : {}),
      ...(patch.customDomain !== undefined
        ? { customDomain: patch.customDomain || null }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(timetables.id, timetableId))
    .returning();
  return updated ?? null;
}

export type SlugChangeResult =
  | { ok: true; timetable: Timetable }
  | { ok: false; reason: "taken" | "not_found" };

/** Admin: change a forum's URL slug (editable slugs, 2026-08-10). The old
 * slug moves into timetable_slug_history, where it resolves and redirects
 * to this forum forever; a forum may reclaim its own old slug (the history
 * row is deleted so the slug goes live again). Caller validates the slug's
 * format — this enforces only availability. */
export async function updateTimetableSlug(
  timetableId: string,
  newSlug: string,
): Promise<SlugChangeResult> {
  const [current] = await db
    .select()
    .from(timetables)
    .where(eq(timetables.id, timetableId))
    .limit(1);
  if (!current) return { ok: false, reason: "not_found" };
  if (current.slug === newSlug) return { ok: true, timetable: current };
  if (await slugTaken(newSlug, timetableId)) {
    return { ok: false, reason: "taken" };
  }

  const updated = await db.transaction(async (tx) => {
    // Reclaiming an own old slug: the history row must go before the
    // unique(slug) column takes the value back.
    await tx
      .delete(timetableSlugHistory)
      .where(eq(timetableSlugHistory.slug, newSlug));
    await tx
      .insert(timetableSlugHistory)
      .values({ timetableId, slug: current.slug })
      .onConflictDoNothing();
    const [row] = await tx
      .update(timetables)
      .set({ slug: newSlug, updatedAt: new Date() })
      .where(eq(timetables.id, timetableId))
      .returning();
    return row ?? null;
  });
  return updated
    ? { ok: true, timetable: updated }
    : { ok: false, reason: "not_found" };
}

/** A current-or-historical slug → the forum's canonical slug, privacy
 * ignored (the proxy's stale-slug redirect must work for signed-out hits
 * on private forums; only the slug mapping is exposed — same trade as
 * forumRouteByDomain). Null when the slug is unknown. */
export async function getCanonicalTimetableSlug(
  slug: string,
): Promise<string | null> {
  const [live] = await db
    .select({ slug: timetables.slug })
    .from(timetables)
    .where(eq(timetables.slug, slug))
    .limit(1);
  if (live) return live.slug;
  const [historical] = await db
    .select({ slug: timetables.slug })
    .from(timetableSlugHistory)
    .innerJoin(timetables, eq(timetables.id, timetableSlugHistory.timetableId))
    .where(eq(timetableSlugHistory.slug, slug))
    .limit(1);
  return historical?.slug ?? null;
}

/** Resolve a timetable by its custom domain (for hostname-based routing). */
export async function getTimetableByDomain(
  host: string,
): Promise<Timetable | null> {
  const [timetable] = await db
    .select()
    .from(timetables)
    .where(eq(timetables.customDomain, host))
    .limit(1);
  return timetable ?? null;
}

export type MembershipWithTimetable = {
  membershipId: string;
  roles: Role[];
  timetable: Timetable;
};

export async function listMembershipsForUser(
  userId: string,
): Promise<MembershipWithTimetable[]> {
  const rows = await db
    .select({
      membershipId: timetableMemberships.id,
      roles: timetableMemberships.roles,
      timetable: timetables,
    })
    .from(timetableMemberships)
    .innerJoin(timetables, eq(timetables.id, timetableMemberships.timetableId))
    .where(eq(timetableMemberships.userId, userId));

  return rows.map((r) => ({
    membershipId: r.membershipId,
    roles: r.roles,
    timetable: r.timetable,
  }));
}

/** The slug of the timetable the user most recently engaged with —
 * max lastSeenFeedAt across memberships, falling back to the most recently
 * created membership. Null when the user has no timetables. Used for the
 * signed-in landing redirect and the brand-logo link (QA #42). */
export async function getLastVisitedTimetableSlug(
  userId: string,
): Promise<string | null> {
  const rows = await db
    .select({
      slug: timetables.slug,
      lastSeenFeedAt: timetableMemberships.lastSeenFeedAt,
      createdAt: timetableMemberships.createdAt,
    })
    .from(timetableMemberships)
    .innerJoin(timetables, eq(timetables.id, timetableMemberships.timetableId))
    .where(eq(timetableMemberships.userId, userId));
  if (rows.length === 0) return null;
  rows.sort(
    (a, b) =>
      (b.lastSeenFeedAt?.getTime() ?? 0) - (a.lastSeenFeedAt?.getTime() ?? 0) ||
      b.createdAt.getTime() - a.createdAt.getTime(),
  );
  return rows[0]?.slug ?? null;
}

export async function getViewerRoles(
  userId: string | null,
  timetableId: string,
): Promise<Role[]> {
  if (!userId) return [];
  const [membership] = await db
    .select({ roles: timetableMemberships.roles })
    .from(timetableMemberships)
    .where(
      and(
        eq(timetableMemberships.userId, userId),
        eq(timetableMemberships.timetableId, timetableId),
      ),
    )
    .limit(1);
  return membership?.roles ?? [];
}

export type ReadableTimetable = {
  timetable: Timetable;
  roles: Role[];
};

/** Load a timetable by id or slug, enforcing read access for the viewer.
 * `sysadmin` (set by the API layer from SYSADMIN_EMAILS) grants read-only
 * operator access to otherwise-unreadable forums (2026-07-29); the
 * returned roles stay the member roles, so writes remain gated. */
export async function getReadableTimetable(
  userId: string | null,
  idOrSlug: string,
  opts: { sysadmin?: boolean } = {},
): Promise<ReadableTimetable | null> {
  let [timetable] = await db
    .select()
    .from(timetables)
    .where(
      UUID_RE.test(idOrSlug)
        ? eq(timetables.id, idOrSlug)
        : eq(timetables.slug, idOrSlug),
    )
    .limit(1);

  // Renamed forums stay reachable by every slug they've ever had (editable
  // slugs, 2026-08-10) — API paths, ICS/Atom URLs and GraphQL idOrSlug all
  // funnel through here; the web proxy separately 308s to the new slug.
  if (!timetable && !UUID_RE.test(idOrSlug)) {
    [timetable] = await db
      .select(getTableColumns(timetables))
      .from(timetableSlugHistory)
      .innerJoin(
        timetables,
        eq(timetables.id, timetableSlugHistory.timetableId),
      )
      .where(eq(timetableSlugHistory.slug, idOrSlug))
      .limit(1);
  }

  if (!timetable) return null;

  const roles = await getViewerRoles(userId, timetable.id);
  const viewer = { userId, roles, sysadmin: opts.sysadmin };
  if (!canReadTimetable(timetable.privacy, viewer)) return null;

  return { timetable, roles };
}
