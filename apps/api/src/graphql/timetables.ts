import { GraphQLError } from "graphql";

import {
  getCanonicalTimetableSlug,
  getFeedLastSeen,
  getLastVisitedTimetableSlug,
  getReadableTimetable,
  getTimetableByDomain,
  getViewerRoles,
  listMembershipsForUser,
  logActivity,
  markFeedSeen,
  setHeartsCountFrom,
  updateTimetableProfile,
  updateTimetableSettings,
  updateTimetableSlug,
} from "@timetable/core";
import type { Timetable, TimetableSettings } from "@timetable/db";
import {
  canEditSettings,
  canModerate,
  forumSlugSchema,
  PRIVACY_LEVELS,
  type Privacy,
} from "@timetable/shared";

import { builder } from "./builder";
import {
  badRequest,
  colour,
  forbidden,
  loadTimetableAndViewer,
  notFound,
  parseCalendarJson,
  parseThemeJson,
  readTimetable,
} from "./guards";
import { parseDigestKinds } from "./members";
import { TimetableType, type GqlTimetable } from "./types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type GqlTimetableRoute = Pick<Timetable, "id" | "slug" | "privacy">;
type GqlMembership = { id: string; roles: string[]; timetable: GqlTimetable };

const TimetableRouteType = builder
  .objectRef<GqlTimetableRoute>("ForumRoute")
  .implement({
    fields: (t) => ({
      id: t.exposeID("id"),
      slug: t.exposeString("slug"),
      privacy: t.exposeString("privacy"),
    }),
  });

const MembershipType = builder
  .objectRef<GqlMembership>("Membership")
  .implement({
    fields: (t) => ({
      id: t.exposeID("id"),
      roles: t.exposeStringList("roles"),
      forum: t.field({ type: TimetableType, resolve: (m) => m.timetable }),
    }),
  });

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

builder.queryFields((t) => ({
  myForums: t.field({
    type: [MembershipType],
    resolve: async (_p, _a, ctx) => {
      if (!ctx.user) return [];
      // No invite-claim here: pending invites only exist for emails with
      // no local account (inviteEmails adds memberships immediately
      // otherwise), and both row-creation paths claim them — sign-in JIT
      // creation (auth/clerk.ts) and admin pre-create (createLocalUser).
      const rows = await listMembershipsForUser(ctx.user.id);
      return rows.map((r) => ({
        id: r.membershipId,
        roles: r.roles as string[],
        timetable: { ...r.timetable, viewerRoles: r.roles as string[] },
      }));
    },
  }),

  forum: t.field({
    type: TimetableType,
    nullable: true,
    args: { idOrSlug: t.arg.string({ required: true }) },
    resolve: async (_p, args, ctx) => {
      const result = await readTimetable(ctx, args.idOrSlug);
      if (!result) return null;
      return { ...result.timetable, viewerRoles: result.roles as string[] };
    },
  }),

  myMembership: t.field({
    type: ["String"],
    args: { forumId: t.arg.string({ required: true }) },
    resolve: async (_p, args, ctx) =>
      (await getViewerRoles(ctx.user?.id ?? null, args.forumId)) as string[],
  }),

  /** Slug of the timetable the viewer last engaged with (for the
   * signed-in landing redirect and brand link). */
  myLastVisitedForumSlug: t.string({
    nullable: true,
    resolve: async (_p, _args, ctx) =>
      ctx.user ? getLastVisitedTimetableSlug(ctx.user.id) : null,
  }),

  /** The viewer's feed watermark for the "new since last visit"
   * highlight; null for anonymous visitors and first-time viewers. */
  myFeedLastSeenAt: t.string({
    nullable: true,
    args: { idOrSlug: t.arg.string({ required: true }) },
    resolve: async (_p, args, ctx) => {
      if (!ctx.user) return null;
      const readable = await readTimetable(ctx, args.idOrSlug);
      if (!readable) return null;
      const seen = await getFeedLastSeen(ctx.user.id, readable.timetable.id);
      return seen ? seen.toISOString() : null;
    },
  }),

  /** Public hostname routing lookup. Returns only route-safe fields. */
  forumRouteByDomain: t.field({
    type: TimetableRouteType,
    nullable: true,
    args: { host: t.arg.string({ required: true }) },
    resolve: async (_p, args) => {
      const timetable = await getTimetableByDomain(args.host);
      if (!timetable) return null;
      return {
        id: timetable.id,
        slug: timetable.slug,
        privacy: timetable.privacy,
      };
    },
  }),

  /** A current-or-historical slug → the forum's canonical slug (editable
   * slugs, 2026-08-10). Anonymous by design — the web proxy's stale-slug
   * 308 must fire for signed-out hits on private forums too. Only the slug
   * mapping is exposed (same trade as forumRouteByDomain). */
  forumCanonicalSlug: t.string({
    nullable: true,
    args: { slug: t.arg.string({ required: true }) },
    resolve: (_p, args) => getCanonicalTimetableSlug(args.slug),
  }),
}));

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/** Editable slugs (2026-08-10): validate + apply a requested slug change.
 * Returns the fresh row when the slug moved, null on no-op. Format is
 * checked here, availability in core; the old slug redirects forever via
 * timetable_slug_history. */
async function applySlugChange(
  timetable: Timetable,
  actorId: string,
  requestedSlug: string | null | undefined,
): Promise<Timetable | null> {
  const slug = requestedSlug?.trim();
  if (!slug || slug === timetable.slug) return null;
  const parsed = forumSlugSchema.safeParse(slug);
  if (!parsed.success) {
    throw new GraphQLError(
      "URL can only use lowercase letters, numbers, and hyphens",
    );
  }
  const result = await updateTimetableSlug(timetable.id, parsed.data);
  if (!result.ok) {
    if (result.reason === "taken") {
      throw new GraphQLError("That URL is already taken");
    }
    notFound("Forum not found");
  }
  await logActivity({
    timetableId: timetable.id,
    actorId,
    action: "forum.slug",
    note: `/f/${timetable.slug} → /f/${parsed.data}`,
  });
  return result.timetable;
}

builder.mutationFields((t) => ({
  /** Bumps the viewer's feed watermark to now (no-op for non-members). */
  markFeedSeen: t.boolean({
    args: { idOrSlug: t.arg.string({ required: true }) },
    resolve: async (_p, args, ctx) => {
      const { user, readable } = await loadTimetableAndViewer(
        ctx,
        args.idOrSlug,
      );
      await markFeedSeen(user.id, readable.timetable.id);
      return true;
    },
  }),

  /** Admin: update timetable name, visibility, custom domain, URL slug. */
  updateForumProfile: t.field({
    type: TimetableType,
    args: {
      idOrSlug: t.arg.string({ required: true }),
      name: t.arg.string({ required: false }),
      privacy: t.arg.string({ required: false }),
      customDomain: t.arg.string({ required: false }),
      slug: t.arg.string({ required: false }),
    },
    resolve: async (_p, args, ctx) => {
      const { user, readable, viewer } = await loadTimetableAndViewer(
        ctx,
        args.idOrSlug,
      );
      if (!canEditSettings(viewer)) forbidden("Admins only");

      let privacy: Privacy | undefined;
      if (args.privacy != null) {
        if (!(PRIVACY_LEVELS as readonly string[]).includes(args.privacy)) {
          throw new GraphQLError("Invalid privacy value");
        }
        privacy = args.privacy as Privacy;
      }

      let updated = await updateTimetableProfile(readable.timetable.id, {
        name: args.name ?? undefined,
        privacy,
        customDomain:
          args.customDomain != null ? args.customDomain.trim() : undefined,
      });
      if (!updated) notFound("Forum not found");

      const renamed = await applySlugChange(
        readable.timetable,
        user.id,
        args.slug,
      );
      if (renamed) updated = renamed;

      // A privacy change is a distinct, high-signal audit event; a plain
      // name/domain edit is logged as an ordinary settings change.
      const privacyChanged =
        privacy != null && privacy !== readable.timetable.privacy;
      await logActivity({
        timetableId: readable.timetable.id,
        actorId: user.id,
        action: privacyChanged ? "forum.privacy" : "forum.settings",
        ...(privacyChanged ? { note: `Visibility set to ${privacy}` } : {}),
      });
      return { ...updated, viewerRoles: readable.roles as string[] };
    },
  }),

  /** Admin: set (or clear, with null) the timetable's heart-count cutoff —
   * hearts created before it stop counting everywhere. Replaces the old
   * per-topic "archive hearts" reset (QA #42). */
  setHeartsCountFrom: t.field({
    type: TimetableType,
    args: {
      idOrSlug: t.arg.string({ required: true }),
      countFrom: t.arg.string({ required: false }),
    },
    resolve: async (_p, args, ctx) => {
      const { user, readable, viewer } = await loadTimetableAndViewer(
        ctx,
        args.idOrSlug,
      );
      if (!canModerate(viewer)) forbidden("Admins only");
      let countFrom: Date | null = null;
      if (args.countFrom) {
        countFrom = new Date(args.countFrom);
        if (Number.isNaN(countFrom.getTime())) {
          throw new GraphQLError("countFrom must be an ISO date-time");
        }
      }
      await setHeartsCountFrom(readable.timetable.id, countFrom, user.id);
      // Deliberately NOT the request memo: this re-read must observe the
      // heartsCountFrom just written (the memo holds the pre-write row).
      const updated = await getReadableTimetable(user.id, args.idOrSlug);
      if (!updated) notFound("Forum not found");
      return {
        ...updated.timetable,
        viewerRoles: updated.roles as string[],
      };
    },
  }),
}));

builder.mutationFields((t) => ({
  /** Admin: update role labels and theme colors (persisted to settings). */
  updateForumSettings: t.field({
    type: TimetableType,
    args: {
      idOrSlug: t.arg.string({ required: true }),
      roleLabelAdmin: t.arg.string({ required: false }),
      roleLabelHost: t.arg.string({ required: false }),
      roleLabelElector: t.arg.string({ required: false }),
      themePrimary: t.arg.string({ required: false }),
      themeSecondary: t.arg.string({ required: false }),
      /** Full theme object (QA #59) — JSON, validated server-side.
       * Wins over the individual theme args when both are sent. */
      themeJson: t.arg.string({ required: false }),
      coverImageUrl: t.arg.string({ required: false }),
      iconUrl: t.arg.string({ required: false }),
      iconDarkUrl: t.arg.string({ required: false }),
      iconEmoji: t.arg.string({ required: false }),
      /** Digests are all-or-nothing (2026-07-29): the default for new
       * members is just on or off. */
      digestEnabled: t.arg.boolean({ required: false }),
      /** Forum-level per-kind digest defaults (2026-08-11) as a JSON
       * {kind: boolean} object — replaces the stored set. */
      digestKindDefaultsJson: t.arg.string({ required: false }),
      /** Calendar feature settings (calendar v2) — JSON, validated
       * server-side, shallow-merged over the stored calendar group. */
      calendarJson: t.arg.string({ required: false }),
      /** Hosts publish their own topics without admin review. */
      hostsPublishDirectly: t.arg.boolean({ required: false }),
      /** The host-only comment thread (and with it the attributed 💙 row +
       * 💙s in digests). Default on; off turns 💙s into admin-only
       * bookmarks (host hearts, 2026-08-04). */
      hostCommentsEnabled: t.arg.boolean({ required: false }),
    },
    // eslint-disable-next-line complexity, sonarjs/cognitive-complexity -- audit debt (2026-07-22): 13-arg settings-patch assembly; decomposition queued
    resolve: async (_p, args, ctx) => {
      const { user, readable, viewer } = await loadTimetableAndViewer(
        ctx,
        args.idOrSlug,
      );
      if (!canEditSettings(viewer)) forbidden("Admins only");

      const current = readable.timetable.settings;
      const patch: Partial<TimetableSettings> = {};

      if (
        args.roleLabelAdmin != null ||
        args.roleLabelHost != null ||
        args.roleLabelElector != null
      ) {
        patch.roleLabels = {
          ...(current.roleLabels ?? {}),
          ...(args.roleLabelAdmin != null
            ? { admin: args.roleLabelAdmin }
            : {}),
          ...(args.roleLabelHost != null ? { host: args.roleLabelHost } : {}),
          ...(args.roleLabelElector != null
            ? { elector: args.roleLabelElector }
            : {}),
        };
      }

      // Legacy individual theme args — validate through the same HEX_COLOUR
      // gate the themeJson path uses so an invalid string can't be persisted
      // and later injected into the SSR theme <style> tag. Invalid/absent
      // values are dropped (mirrors colour() in parseThemeJson).
      const themePrimary = colour(args.themePrimary);
      const themeSecondary = colour(args.themeSecondary);
      if (themePrimary != null || themeSecondary != null) {
        patch.theme = {
          ...(current.theme ?? {}),
          ...(themePrimary != null ? { primary: themePrimary } : {}),
          ...(themeSecondary != null ? { secondary: themeSecondary } : {}),
        };
      }

      if (args.themeJson != null) {
        const parsed = parseThemeJson(args.themeJson);
        if (!parsed) badRequest("Invalid theme");
        patch.theme = parsed;
      }

      if (args.coverImageUrl != null) {
        patch.coverImageUrl = args.coverImageUrl.trim() || null;
      }

      if (args.iconUrl != null) {
        patch.iconUrl = args.iconUrl.trim() || null;
      }

      if (args.iconDarkUrl != null) {
        patch.iconDarkUrl = args.iconDarkUrl.trim() || null;
      }

      // A short emoji sequence (capped to guard against arbitrary payloads).
      if (args.iconEmoji != null) {
        patch.iconEmoji = args.iconEmoji.trim().slice(0, 24) || null;
      }

      if (args.digestEnabled != null) {
        patch.digestDefaults = {
          ...(current.digestDefaults ?? {}),
          digestEnabled: args.digestEnabled,
        };
      }

      if (args.digestKindDefaultsJson != null) {
        const kinds = parseDigestKinds(args.digestKindDefaultsJson);
        if (!kinds) badRequest("Invalid digest kind defaults");
        patch.digestKindDefaults = kinds;
      }

      if (args.calendarJson != null) {
        const parsed = parseCalendarJson(args.calendarJson);
        if (!parsed) badRequest("Invalid calendar settings");
        patch.calendar = { ...(current.calendar ?? {}), ...parsed };
      }

      if (args.hostsPublishDirectly != null) {
        patch.topics = {
          ...(current.topics ?? {}),
          hostsPublishDirectly: args.hostsPublishDirectly,
        };
      }

      if (args.hostCommentsEnabled != null) {
        patch.hostComments = {
          ...(current.hostComments ?? {}),
          enabled: args.hostCommentsEnabled,
        };
      }

      const updated = await updateTimetableSettings(
        readable.timetable.id,
        patch,
      );
      if (!updated) notFound("Forum not found");
      await logActivity({
        timetableId: readable.timetable.id,
        actorId: user.id,
        action: "forum.settings",
      });
      return { ...updated, viewerRoles: readable.roles as string[] };
    },
  }),
}));
