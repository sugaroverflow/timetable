import SchemaBuilder from "@pothos/core";

import {
  getReadableTimetable,
  getViewerRoles,
  listMembers,
  listMembershipsForUser,
} from "@timetable/core";
import type { Timetable } from "@timetable/db";
import { canManageMembers } from "@timetable/shared";

import type { ApiContext } from "../context";
import type { SessionUser } from "../auth/session";

type GqlTimetable = Timetable & { viewerRoles: string[] };
type GqlMembership = {
  id: string;
  roles: string[];
  timetable: GqlTimetable;
};
type GqlMember = {
  membershipId: string;
  roles: string[];
  user: { id: string; name: string | null; email: string | null; image: string | null };
};

const builder = new SchemaBuilder<{ Context: ApiContext }>({});

const UserType = builder.objectRef<SessionUser>("User").implement({
  fields: (t) => ({
    id: t.exposeID("id"),
    email: t.exposeString("email", { nullable: true }),
    name: t.exposeString("name", { nullable: true }),
    image: t.exposeString("image", { nullable: true }),
    bio: t.exposeString("bio", { nullable: true }),
  }),
});

const TimetableType = builder
  .objectRef<GqlTimetable>("Timetable")
  .implement({
    fields: (t) => ({
      id: t.exposeID("id"),
      slug: t.exposeString("slug"),
      name: t.exposeString("name"),
      description: t.exposeString("description", { nullable: true }),
      privacy: t.exposeString("privacy"),
      customDomain: t.exposeString("customDomain", { nullable: true }),
      /** The acting viewer's roles within this timetable. */
      viewerRoles: t.exposeStringList("viewerRoles"),
      createdAt: t.string({ resolve: (tt) => tt.createdAt.toISOString() }),
    }),
  });

const MembershipType = builder
  .objectRef<GqlMembership>("Membership")
  .implement({
    fields: (t) => ({
      id: t.exposeID("id"),
      roles: t.exposeStringList("roles"),
      timetable: t.field({
        type: TimetableType,
        resolve: (m) => m.timetable,
      }),
    }),
  });

const MemberType = builder.objectRef<GqlMember>("Member").implement({
  fields: (t) => ({
    membershipId: t.exposeID("membershipId"),
    roles: t.exposeStringList("roles"),
    userId: t.id({ resolve: (m) => m.user.id }),
    name: t.string({ nullable: true, resolve: (m) => m.user.name }),
    email: t.string({ nullable: true, resolve: (m) => m.user.email }),
    image: t.string({ nullable: true, resolve: (m) => m.user.image }),
  }),
});

builder.queryType({
  fields: (t) => ({
    /** The currently authenticated user, or null. */
    me: t.field({
      type: UserType,
      nullable: true,
      resolve: (_parent, _args, ctx) => ctx.user,
    }),

    /** Every timetable the user belongs to, with their roles in each. */
    myTimetables: t.field({
      type: [MembershipType],
      resolve: async (_parent, _args, ctx) => {
        if (!ctx.user) return [];
        const rows = await listMembershipsForUser(ctx.user.id);
        return rows.map((r) => ({
          id: r.membershipId,
          roles: r.roles as string[],
          timetable: { ...r.timetable, viewerRoles: r.roles as string[] },
        }));
      },
    }),

    /** A single timetable by id or slug, if the viewer may read it. */
    timetable: t.field({
      type: TimetableType,
      nullable: true,
      args: { idOrSlug: t.arg.string({ required: true }) },
      resolve: async (_parent, args, ctx) => {
        const result = await getReadableTimetable(
          ctx.user?.id ?? null,
          args.idOrSlug,
        );
        if (!result) return null;
        return {
          ...result.timetable,
          viewerRoles: result.roles as string[],
        };
      },
    }),

    /** The viewer's roles in a given timetable (empty if none). */
    myMembership: t.field({
      type: ["String"],
      args: { timetableId: t.arg.string({ required: true }) },
      resolve: async (_parent, args, ctx) =>
        (await getViewerRoles(
          ctx.user?.id ?? null,
          args.timetableId,
        )) as string[],
    }),

    /** Members of a timetable. Admins only; returns [] otherwise. */
    timetableMembers: t.field({
      type: [MemberType],
      args: { timetableId: t.arg.string({ required: true }) },
      resolve: async (_parent, args, ctx) => {
        const viewer = await ctx.getViewer(args.timetableId);
        if (!canManageMembers(viewer)) return [];
        const members = await listMembers(args.timetableId);
        return members.map((m) => ({
          membershipId: m.membershipId,
          roles: m.roles as string[],
          user: m.user,
        }));
      },
    }),
  }),
});

export const schema = builder.toSchema();
