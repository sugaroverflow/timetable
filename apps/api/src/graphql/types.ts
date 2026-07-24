/**
 * Object types shared by more than one GraphQL domain module. Types used by
 * exactly one domain live in that domain's file instead.
 */
import {
  countViewerPublishedHearts,
  type CommentNode,
  type WeightedHeartEntry,
} from "@timetable/core";
import type { Timetable } from "@timetable/db";

import { builder } from "./builder";

export type GqlTimetable = Timetable & { viewerRoles: string[] };

export const TimetableType = builder
  .objectRef<GqlTimetable>("Timetable")
  .implement({
    fields: (t) => ({
      id: t.exposeID("id"),
      slug: t.exposeString("slug"),
      name: t.exposeString("name"),
      description: t.exposeString("description", { nullable: true }),
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
      createdAt: t.string({ resolve: (tt) => tt.createdAt.toISOString() }),
    }),
  });

export const WeightedHeartType = builder
  .objectRef<WeightedHeartEntry>("WeightedHeart")
  .implement({
    fields: (t) => ({
      electorId: t.exposeID("electorId"),
      electorName: t.exposeString("electorName", { nullable: true }),
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
    body: t.exposeString("body"),
    visibility: t.exposeString("visibility"),
    hidden: t.exposeBoolean("hidden"),
    createdAt: t.string({ resolve: (c) => c.createdAt.toISOString() }),
    replies: t.field({ type: [CommentType], resolve: (c) => c.replies }),
  }),
});

export const SlotTagType = builder
  .objectRef<{ id: string; title: string }>("SlotTag")
  .implement({
    fields: (t) => ({
      id: t.exposeID("id"),
      title: t.exposeString("title"),
    }),
  });
