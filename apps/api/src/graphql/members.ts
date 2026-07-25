import {
  getPerson,
  getPersonBySlug,
  getUserNotificationSettings,
  listMembers,
  listPeople,
  logActivity,
  updateMemberProfile,
  updateUserNotificationSettings,
  type Person,
} from "@timetable/core";
import {
  canManageMembers,
  canModerate,
  canSeePersonProfile,
  type Privacy,
  type Role as SharedRole,
  type Viewer,
} from "@timetable/shared";

import type { SessionUser } from "../auth/clerk";
import { renderMarkdown } from "../markdown";
import { builder } from "./builder";
import {
  forbidden,
  loadTimetableAndViewer,
  notFound,
  readTimetable,
  requireAdminTimetable,
  requireUser,
} from "./guards";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type GqlMember = {
  membershipId: string;
  roles: string[];
  inviteSentAt: Date | null;
  user: {
    id: string;
    name: string | null;
    email: string | null;
    image: string | null;
  };
};

const UserType = builder.objectRef<SessionUser>("User").implement({
  fields: (t) => ({
    id: t.exposeID("id"),
    email: t.exposeString("email", { nullable: true }),
    name: t.exposeString("name", { nullable: true }),
    image: t.exposeString("image", { nullable: true }),
    bio: t.exposeString("bio", { nullable: true }),
    notificationSettings: t.string({
      resolve: async (u) =>
        JSON.stringify(await getUserNotificationSettings(u.id)),
    }),
  }),
});

const MemberType = builder.objectRef<GqlMember>("Member").implement({
  fields: (t) => ({
    membershipId: t.exposeID("membershipId"),
    roles: t.exposeStringList("roles"),
    inviteSentAt: t.string({
      nullable: true,
      resolve: (m) => m.inviteSentAt?.toISOString() ?? null,
    }),
    userId: t.id({ resolve: (m) => m.user.id }),
    name: t.string({ nullable: true, resolve: (m) => m.user.name }),
    email: t.string({ nullable: true, resolve: (m) => m.user.email }),
    image: t.string({ nullable: true, resolve: (m) => m.user.image }),
  }),
});

const PersonTopicType = builder
  .objectRef<{ id: string; title: string; slug: string | null }>("PersonTopic")
  .implement({
    fields: (t) => ({
      id: t.exposeID("id"),
      title: t.exposeString("title"),
      slug: t.exposeString("slug", { nullable: true }),
    }),
  });

const PersonType = builder.objectRef<Person>("Person").implement({
  fields: (t) => ({
    userId: t.exposeID("userId"),
    name: t.exposeString("name", { nullable: true }),
    image: t.exposeString("image", { nullable: true }),
    slug: t.exposeString("slug", { nullable: true }),
    roles: t.exposeStringList("roles"),
    /** Markdown bios (QA #42), rendered with the shared pipeline. */
    bioHtml: t.string({
      nullable: true,
      resolve: (p) => (p.bio ? renderMarkdown(p.bio) : null),
    }),
    bio: t.exposeString("bio", { nullable: true }),
    /** Published topics this person hosts (QA #59 — People page cards). */
    publishedTopics: t.field({
      type: [PersonTopicType],
      resolve: (p) => p.publishedTopics ?? [],
    }),
  }),
});

/** Non-admins don't get to see who owns the forum (launch QA 2026-07-25):
 * the owner role is stripped from profiles before they leave the API, so
 * the Owner pill (People page, bio modal, person pages, host card) only
 * renders for admin viewers. */
function withPublicRoles(person: Person, viewer: Viewer): Person {
  if (canModerate(viewer)) return person;
  return {
    ...person,
    roles: person.roles.filter((r) => r !== "owner"),
  };
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

builder.queryFields((t) => ({
  me: t.field({
    type: UserType,
    nullable: true,
    resolve: (_p, _a, ctx) => ctx.user,
  }),

  /** Members with public profile fields (People page). Anyone who can
   * read the timetable can see it — bios follow timetable visibility. */
  timetablePeople: t.field({
    type: [PersonType],
    args: { idOrSlug: t.arg.string({ required: true }) },
    resolve: async (_p, args, ctx) => {
      const readable = await readTimetable(ctx, args.idOrSlug);
      if (!readable) return [];
      const viewer = { userId: ctx.user?.id ?? null, roles: readable.roles };
      const people = await listPeople(readable.timetable.id);
      return people
        .filter((p) =>
          canSeePersonProfile(
            readable.timetable.privacy as Privacy,
            viewer,
            p.roles as SharedRole[],
          ),
        )
        .map((p) => withPublicRoles(p, viewer));
    },
  }),

  /** One member's public profile — powers the bio modal, the person pages,
   * and (with no user args) the viewer's own per-forum profile editor.
   * Lookup: userId, or user slug, or the signed-in viewer. */
  person: t.field({
    type: PersonType,
    nullable: true,
    args: {
      idOrSlug: t.arg.string({ required: true }),
      userId: t.arg.string({ required: false }),
      userSlug: t.arg.string({ required: false }),
    },
    resolve: async (_p, args, ctx) => {
      const readable = await readTimetable(ctx, args.idOrSlug);
      if (!readable) return null;
      const viewer = { userId: ctx.user?.id ?? null, roles: readable.roles };
      const targetId = args.userId ?? (args.userSlug ? null : ctx.user?.id);
      const person = targetId
        ? await getPerson(readable.timetable.id, targetId)
        : args.userSlug
          ? await getPersonBySlug(readable.timetable.id, args.userSlug)
          : null;
      if (
        person &&
        !canSeePersonProfile(
          readable.timetable.privacy as Privacy,
          viewer,
          person.roles as SharedRole[],
        )
      ) {
        return null;
      }
      return person ? withPublicRoles(person, viewer) : null;
    },
  }),

  timetableMembers: t.field({
    type: [MemberType],
    args: { timetableId: t.arg.string({ required: true }) },
    resolve: async (_p, args, ctx) => {
      const viewer = await ctx.getViewer(args.timetableId);
      if (!canManageMembers(viewer)) return [];
      const members = await listMembers(args.timetableId);
      return members.map((m) => ({
        membershipId: m.membershipId,
        roles: m.roles as string[],
        inviteSentAt: m.inviteSentAt,
        user: m.user,
      }));
    },
  }),
}));

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

builder.mutationFields((t) => ({
  /** Audit trail for the view-as-user preview (QA #59 round 3): called
   * as the admin enters the preview, before the cookie applies. The
   * preview itself is enforced per-request from the x-view-as header. */
  startUserPreview: t.boolean({
    args: {
      idOrSlug: t.arg.string({ required: true }),
      userId: t.arg.string({ required: true }),
    },
    resolve: async (_p, args, ctx) => {
      const { user, readable, viewer } = await loadTimetableAndViewer(
        ctx,
        args.idOrSlug,
      );
      if (!canModerate(viewer)) forbidden("Admins only");
      const target = await getPerson(readable.timetable.id, args.userId);
      if (!target) notFound("Member not found");
      await logActivity({
        timetableId: readable.timetable.id,
        actorId: user.id,
        action: "member.impersonate",
        payload: { targetUserId: target.userId, targetName: target.name },
      });
      return true;
    },
  }),

  /** Companion audit entry when the preview ends (cookie already
   * cleared, so this runs as the real admin again). */
  stopUserPreview: t.boolean({
    args: {
      idOrSlug: t.arg.string({ required: true }),
      userId: t.arg.string({ required: true }),
    },
    resolve: async (_p, args, ctx) => {
      const { user, readable, viewer } = await loadTimetableAndViewer(
        ctx,
        args.idOrSlug,
      );
      if (!canModerate(viewer)) forbidden("Admins only");
      await logActivity({
        timetableId: readable.timetable.id,
        actorId: user.id,
        action: "member.impersonate_end",
        payload: { targetUserId: args.userId },
      });
      return true;
    },
  }),

  /** Edit the current user's own profile in one forum (per-forum profiles:
   * name/photo/bio/slug live on the membership, not the account). */
  updateMyProfile: t.field({
    type: PersonType,
    nullable: true,
    args: {
      idOrSlug: t.arg.string({ required: true }),
      name: t.arg.string({ required: false }),
      bio: t.arg.string({ required: false }),
      image: t.arg.string({ required: false }),
    },
    resolve: async (_p, args, ctx) => {
      const { user, readable } = await loadTimetableAndViewer(
        ctx,
        args.idOrSlug,
      );
      const updated = await updateMemberProfile(
        readable.timetable.id,
        user.id,
        {
          name: args.name ?? undefined,
          bio: args.bio ?? undefined,
          image: args.image != null ? args.image.trim() || null : undefined,
        },
      );
      if (!updated) notFound("Membership not found");
      return getPerson(readable.timetable.id, user.id);
    },
  }),

  /** Update the current user's digest preferences (no sends yet). */
  updateMyNotificationSettings: t.field({
    type: UserType,
    args: {
      digestNewTopics: t.arg.boolean({ required: false }),
      digestReplies: t.arg.boolean({ required: false }),
      digestActivity: t.arg.boolean({ required: false }),
    },
    resolve: async (_p, args, ctx) => {
      const user = await requireUser(ctx);
      const updated = await updateUserNotificationSettings(user.id, {
        ...(args.digestNewTopics != null
          ? { digestNewTopics: args.digestNewTopics }
          : {}),
        ...(args.digestReplies != null
          ? { digestReplies: args.digestReplies }
          : {}),
        ...(args.digestActivity != null
          ? { digestActivity: args.digestActivity }
          : {}),
      });
      if (!updated) notFound("User not found");
      return {
        id: updated.id,
        email: updated.email,
        name: updated.name,
        image: updated.image,
        bio: updated.bio,
      };
    },
  }),

  /** Admin: edit any member's bio (QA #42 — bios are editable from the
   * Members section in Settings) and profile image (production QA).
   * Logged to the activity feed. */
  updateMemberBio: t.field({
    type: PersonType,
    nullable: true,
    args: {
      idOrSlug: t.arg.string({ required: true }),
      userId: t.arg.string({ required: true }),
      bio: t.arg.string({ required: true }),
      /** Omit to leave unchanged; empty string clears. */
      image: t.arg.string({ required: false }),
    },
    resolve: async (_p, args, ctx) => {
      const { user, readable } = await requireAdminTimetable(
        ctx,
        args.idOrSlug,
      );
      const target = await getPerson(readable.timetable.id, args.userId);
      if (!target) notFound("Member not found");
      await updateMemberProfile(readable.timetable.id, args.userId, {
        bio: args.bio.trim() || null,
        ...(args.image != null ? { image: args.image.trim() || null } : {}),
      });
      await logActivity({
        timetableId: readable.timetable.id,
        actorId: user.id,
        action: "member.bio_edit",
        payload: { userId: args.userId, name: target.name },
      });
      return getPerson(readable.timetable.id, args.userId);
    },
  }),
}));
