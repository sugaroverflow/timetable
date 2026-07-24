import { GraphQLError } from "graphql";

import {
  getFeedLastSeen,
  getLastVisitedTimetableSlug,
  getReadableTimetable,
  getTimetableByDomain,
  getViewerRoles,
  listMembershipsForUser,
  markFeedSeen,
  setHeartsCountFrom,
  updateTimetableProfile,
  updateTimetableSettings,
} from "@timetable/core";
import type { Timetable, TimetableSettings } from "@timetable/db";
import {
  canEditSettings,
  canModerate,
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
  parseThemeJson,
  readTimetable,
} from "./guards";
import { TimetableType, type GqlTimetable } from "./types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type GqlTimetableRoute = Pick<Timetable, "id" | "slug" | "privacy">;
type GqlMembership = { id: string; roles: string[]; timetable: GqlTimetable };

const TimetableRouteType = builder
  .objectRef<GqlTimetableRoute>("TimetableRoute")
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
      timetable: t.field({ type: TimetableType, resolve: (m) => m.timetable }),
    }),
  });

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

builder.queryFields((t) => ({
  myTimetables: t.field({
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

  timetable: t.field({
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
    args: { timetableId: t.arg.string({ required: true }) },
    resolve: async (_p, args, ctx) =>
      (await getViewerRoles(
        ctx.user?.id ?? null,
        args.timetableId,
      )) as string[],
  }),

  /** Slug of the timetable the viewer last engaged with (for the
   * signed-in landing redirect and brand link). */
  myLastVisitedTimetableSlug: t.string({
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
  timetableRouteByDomain: t.field({
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
}));

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

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

  /** Admin: update timetable name, description, visibility, custom domain. */
  updateTimetableProfile: t.field({
    type: TimetableType,
    args: {
      idOrSlug: t.arg.string({ required: true }),
      name: t.arg.string({ required: false }),
      description: t.arg.string({ required: false }),
      privacy: t.arg.string({ required: false }),
      customDomain: t.arg.string({ required: false }),
    },
    resolve: async (_p, args, ctx) => {
      const { readable, viewer } = await loadTimetableAndViewer(
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

      const updated = await updateTimetableProfile(readable.timetable.id, {
        name: args.name ?? undefined,
        description: args.description ?? undefined,
        privacy,
        customDomain:
          args.customDomain != null ? args.customDomain.trim() : undefined,
      });
      if (!updated) notFound("Timetable not found");
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
      if (!updated) notFound("Timetable not found");
      return {
        ...updated.timetable,
        viewerRoles: updated.roles as string[],
      };
    },
  }),
}));

builder.mutationFields((t) => ({
  /** Admin: update role labels and theme colors (persisted to settings). */
  updateTimetableSettings: t.field({
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
      iconEmoji: t.arg.string({ required: false }),
      digestNewTopics: t.arg.boolean({ required: false }),
      digestReplies: t.arg.boolean({ required: false }),
      digestActivity: t.arg.boolean({ required: false }),
    },
    // eslint-disable-next-line complexity, sonarjs/cognitive-complexity -- audit debt (2026-07-22): 13-arg settings-patch assembly; decomposition queued
    resolve: async (_p, args, ctx) => {
      const { readable, viewer } = await loadTimetableAndViewer(
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

      // A short emoji sequence (capped to guard against arbitrary payloads).
      if (args.iconEmoji != null) {
        patch.iconEmoji = args.iconEmoji.trim().slice(0, 24) || null;
      }

      if (
        args.digestNewTopics != null ||
        args.digestReplies != null ||
        args.digestActivity != null
      ) {
        patch.digestDefaults = {
          ...(current.digestDefaults ?? {}),
          ...(args.digestNewTopics != null
            ? { digestNewTopics: args.digestNewTopics }
            : {}),
          ...(args.digestReplies != null
            ? { digestReplies: args.digestReplies }
            : {}),
          ...(args.digestActivity != null
            ? { digestActivity: args.digestActivity }
            : {}),
        };
      }

      const updated = await updateTimetableSettings(
        readable.timetable.id,
        patch,
      );
      if (!updated) notFound("Timetable not found");
      return { ...updated, viewerRoles: readable.roles as string[] };
    },
  }),
}));
