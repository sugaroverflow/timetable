import { GraphQLError } from "graphql";

import {
  getReadableTimetable,
  getSlotById,
  getTimetableById,
  getTopicById,
  getViewerRoles,
  type Audience,
  type ElectorActivityFilter,
} from "@timetable/core";
import type { TimetableSettings } from "@timetable/db";
import {
  canManageMembers,
  canModerate,
  isAdmin,
  isHost,
} from "@timetable/shared";

import type { SessionUser } from "../auth/clerk";
import type { ApiContext } from "../context";

// ---------------------------------------------------------------------------
// Error helpers
// ---------------------------------------------------------------------------

export function unauthenticated(): never {
  throw new GraphQLError("Not authenticated", {
    extensions: { code: "UNAUTHENTICATED" },
  });
}

export function forbidden(message = "Forbidden"): never {
  throw new GraphQLError(message, { extensions: { code: "FORBIDDEN" } });
}

export function notFound(message = "Not found"): never {
  throw new GraphQLError(message, { extensions: { code: "NOT_FOUND" } });
}

export function badRequest(message = "Bad request"): never {
  throw new GraphQLError(message, { extensions: { code: "BAD_REQUEST" } });
}

// ---------------------------------------------------------------------------
// Auth + loader guards
// ---------------------------------------------------------------------------

export async function requireUser(ctx: ApiContext): Promise<SessionUser> {
  if (!ctx.user) unauthenticated();
  return ctx.user;
}

/** getReadableTimetable through the request-scoped memo when the context
 * provides one (buildContext does; bare test contexts fall back to a direct
 * call). Saves ~6 duplicate lookups on a multi-resolver feed document. */
export function readTimetable(ctx: ApiContext, idOrSlug: string) {
  return ctx.readableTimetable
    ? ctx.readableTimetable(idOrSlug)
    : getReadableTimetable(ctx.user?.id ?? null, idOrSlug);
}

/** The guard ladder shared by timetable-scoped resolvers: authenticated
 * user → readable timetable (NOT_FOUND otherwise) → viewer for permission
 * checks. */
export async function loadTimetableAndViewer(
  ctx: ApiContext,
  idOrSlug: string,
) {
  const user = await requireUser(ctx);
  const readable = await readTimetable(ctx, idOrSlug);
  if (!readable) notFound("Timetable not found");
  const viewer = { userId: user.id, roles: readable.roles };
  return { user, readable, viewer };
}

/** loadTimetableAndViewer plus the member-management gate ("Admins only"). */
export async function requireAdminTimetable(ctx: ApiContext, idOrSlug: string) {
  const loaded = await loadTimetableAndViewer(ctx, idOrSlug);
  if (!canManageMembers(loaded.viewer)) forbidden("Admins only");
  return loaded;
}

export async function loadTopicAndViewer(ctx: ApiContext, topicId: string) {
  const topic = await getTopicById(topicId);
  if (!topic) notFound("Topic not found");
  const viewer = await ctx.getViewer(topic.timetableId);
  const timetable = await getTimetableById(topic.timetableId);
  if (timetable?.privacy === "deactivated" && !canModerate(viewer)) {
    forbidden("Timetable is deactivated");
  }
  return { topic, viewer };
}

/** Target-eligibility rule shared by createTopic(hostId) and reassignTopic:
 * a topic's owner must already hold the host or admin role. */
export async function assertCanOwnTopic(userId: string, timetableId: string) {
  const targetRoles = await getViewerRoles(userId, timetableId);
  if (!(isHost(targetRoles) || isAdmin(targetRoles))) {
    throw new GraphQLError(
      "New owner must hold the host or admin role in this timetable",
    );
  }
}

export async function loadSlotAndViewer(ctx: ApiContext, slotId: string) {
  const slot = await getSlotById(slotId);
  if (!slot) notFound("Timeslot not found");
  const viewer = await ctx.getViewer(slot.timetableId);
  const timetable = await getTimetableById(slot.timetableId);
  if (timetable?.privacy === "deactivated" && !canModerate(viewer)) {
    forbidden("Timetable is deactivated");
  }
  return { slot, viewer };
}

// ---------------------------------------------------------------------------
// Argument parsers
// ---------------------------------------------------------------------------

export function parseAudience(
  raw: string | null | undefined,
  viewerUserId: string | null,
): Audience {
  if (raw === "hearted_mine" && viewerUserId) {
    return { kind: "hearted_mine", hostId: viewerUserId };
  }
  if (raw?.startsWith("hearted_topic:")) {
    return {
      kind: "hearted_topic",
      topicId: raw.slice("hearted_topic:".length),
    };
  }
  return { kind: "all" };
}

export function parseElectorActivityFilter(
  raw: string | null | undefined,
): ElectorActivityFilter {
  if (
    raw === "active" ||
    raw === "quiet" ||
    raw === "no_hearts" ||
    raw === "no_comments" ||
    raw === "no_availability"
  ) {
    return raw;
  }
  return "all";
}

// ---------------------------------------------------------------------------
// Theme validation
// ---------------------------------------------------------------------------

const THEME_FONTS = new Set([
  "default",
  "editorial",
  "humanist",
  "modern",
  "technical",
]);
const HEX_COLOUR = /^#[0-9a-fA-F]{6}$/;

/** A validated #rrggbb hex, or undefined. Shared by the themeJson parser and
 * the legacy themePrimary/themeSecondary args so no unvalidated colour is ever
 * stored (and later injected into the SSR theme <style> tag). */
export const colour = (v: unknown): string | undefined =>
  typeof v === "string" && HEX_COLOUR.test(v) ? v : undefined;

/** Validate a client-sent theme (QA #59): known keys only, colours must be
 * #rrggbb, font from the curated list. Returns null when invalid. */
export function parseThemeJson(
  raw: string,
): NonNullable<TimetableSettings["theme"]> | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const source = parsed as Record<string, unknown>;

  const theme: NonNullable<TimetableSettings["theme"]> = {};
  theme.primary = colour(source.primary);
  theme.secondary = colour(source.secondary);
  theme.background = colour(source.background);
  theme.topbar = colour(source.topbar);
  theme.topbarText = colour(source.topbarText);
  theme.text = colour(source.text);
  if (typeof source.font === "string" && THEME_FONTS.has(source.font)) {
    theme.font = source.font;
  }
  if (typeof source.dark === "object" && source.dark !== null) {
    const d = source.dark as Record<string, unknown>;
    theme.dark = {
      primary: colour(d.primary),
      secondary: colour(d.secondary),
      background: colour(d.background),
      topbar: colour(d.topbar),
      topbarText: colour(d.topbarText),
      text: colour(d.text),
    };
  }
  return theme;
}
