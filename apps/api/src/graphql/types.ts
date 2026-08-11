/**
 * Object types shared by more than one GraphQL domain module. Types used by
 * exactly one domain live in that domain's file instead.
 */
import {
  countViewerPublishedHearts,
  forumHasSlots,
  getMembershipDigestSettings,
  getPerson,
  type CommentNode,
  type WeightedHeartEntry,
} from "@timetable/core";
import type { Timetable } from "@timetable/db";
import { isCalendarEnabled } from "@timetable/shared";

import { builder } from "./builder";

export type GqlTimetable = Timetable & { viewerRoles: string[] };

/** The viewer's own per-forum profile — powers the account menu's avatar. */
const ViewerProfileType = builder
  .objectRef<{ name: string | null; image: string | null }>("ViewerProfile")
  .implement({
    fields: (t) => ({
      name: t.exposeString("name", { nullable: true }),
      image: t.exposeString("image", { nullable: true }),
    }),
  });

export const TimetableType = builder
  .objectRef<GqlTimetable>("Forum")
  .implement({
    fields: (t) => ({
      id: t.exposeID("id"),
      slug: t.exposeString("slug"),
      name: t.exposeString("name"),
      privacy: t.exposeString("privacy"),
      customDomain: t.exposeString("customDomain", { nullable: true }),
      heartsCountFrom: t.string({
        nullable: true,
        resolve: (tt) => tt.heartsCountFrom?.toISOString() ?? null,
      }),
      viewerRoles: t.exposeStringList("viewerRoles"),
      settings: t.field({
        type: "String",
        resolve: (tt) => JSON.stringify(tt.settings ?? {}),
      }),
      /** Whether any timeslots exist (past included) — the calendar nav
       * link/page hide from non-admins until the schedule does
       * (QA 2026-08-03). False without a COUNT when the calendar's off. */
      calendarHasSlots: t.boolean({
        resolve: (tt) =>
          isCalendarEnabled(tt.settings ?? {}) ? forumHasSlots(tt.id) : false,
      }),
      /**
       * Published topics the signed-in viewer currently hearts — their vote
       * weight is 1/count. Null for anonymous viewers. Viewer-scoped, so safe
       * for any member (unlike the host-only weighted breakdowns).
       */
      viewerHeartedPublishedCount: t.int({
        nullable: true,
        resolve: (tt, _args, ctx) =>
          ctx.user ? countViewerPublishedHearts(tt.id, ctx.user.id) : null,
      }),
      /** The viewer's per-forum digest settings (2026-08-11) as JSON
       * (on/off, cadence, kind switches); "{}" (all fallbacks) for
       * anonymous viewers and non-members. */
      viewerDigestSettings: t.string({
        resolve: async (tt, _args, ctx) =>
          JSON.stringify(
            ctx.user
              ? await getMembershipDigestSettings(tt.id, ctx.user.id)
              : {},
          ),
      }),
      /** The viewer's own membership profile here; null for anonymous
       * viewers and non-members. */
      viewerProfile: t.field({
        type: ViewerProfileType,
        nullable: true,
        resolve: async (tt, _args, ctx) => {
          if (!ctx.user) return null;
          const person = await getPerson(tt.id, ctx.user.id);
          return person ? { name: person.name, image: person.image } : null;
        },
      }),
      createdAt: t.string({ resolve: (tt) => tt.createdAt.toISOString() }),
    }),
  });

export const WeightedHeartType = builder
  .objectRef<WeightedHeartEntry>("WeightedHeart")
  .implement({
    fields: (t) => ({
      electorId: t.exposeID("electorId"),
      electorName: t.exposeString("electorName", { nullable: true }),
      electorImage: t.exposeString("electorImage", { nullable: true }),
      weight: t.exposeFloat("weight"),
      l2Weight: t.exposeFloat("l2Weight"),
      devotionWeight: t.exposeFloat("devotionWeight"),
      heartedAt: t.string({ resolve: (w) => w.heartedAt.toISOString() }),
    }),
  });

export const CommentType = builder.objectRef<CommentNode>("Comment");
CommentType.implement({
  fields: (t) => ({
    id: t.exposeID("id"),
    parentId: t.exposeID("parentId", { nullable: true }),
    authorId: t.exposeID("authorId"),
    authorName: t.exposeString("authorName", { nullable: true }),
    authorImage: t.exposeString("authorImage", { nullable: true }),
    authorRoles: t.exposeStringList("authorRoles"),
    body: t.exposeString("body"),
    visibility: t.exposeString("visibility"),
    hidden: t.exposeBoolean("hidden"),
    /** Author-deleted tombstone (body/author already blanked server-side). */
    deleted: t.exposeBoolean("deleted"),
    editedAt: t.string({
      nullable: true,
      resolve: (c) => c.editedAt?.toISOString() ?? null,
    }),
    createdAt: t.string({ resolve: (c) => c.createdAt.toISOString() }),
    replies: t.field({ type: [CommentType], resolve: (c) => c.replies }),
  }),
});
