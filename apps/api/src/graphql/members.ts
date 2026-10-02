import {
  getPerson,
  getPersonBySlug,
  getUserNotificationSettings,
  listMembers,
  listPeople,
  logActivity,
  updateMemberProfile,
  updateMembershipDigestSettings,
  updateUserNotificationSettings,
  type Person,
} from "@timetable/core";
import {
  canManageMembers,
  canModerate,
  canSeeContactDetails,
  canSeePersonProfile,
  DIGEST_KINDS,
  type DigestKinds,
  type Privacy,
  type Role as SharedRole,
  type Viewer,
} from "@timetable/shared";

import type { SessionUser } from "../auth/clerk";
import { renderMarkdown } from "../markdown";
import { isSysadmin } from "../auth/sysadmin";
import { builder } from "./builder";
import {
  assertOptionalHttpUrl,
  capLength,
  forbidden,
  loadTimetableAndViewer,
  notFound,
  readTimetable,
  requireAdminTimetable,
  requireUser,
} from "./guards";

/** Max bio length, shared by the self-edit and admin-edit mutations so the two
 * can't drift apart. Storage hygiene only — the column is unbounded `text`. */
const BIO_MAX_LENGTH = 8000;
/** Contact Details are a few lines of addresses and handles, not an essay. */
const CONTACT_DETAILS_MAX_LENGTH = 1000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type GqlMember = {
  membershipId: string;
  roles: string[];
  inviteSentAt: Date | null;
  deactivatedAt: Date | null;
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
    notificationSettings: t.string({
      resolve: async (u) =>
        JSON.stringify(await getUserNotificationSettings(u.id)),
    }),
    /** Global sysadmin (SYSADMIN_EMAILS env) — gates the /admin page. */
    isSysadmin: t.boolean({ resolve: (u) => isSysadmin(u) }),
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
    /** Set while deactivated (member-deactivation, 2026-09-10). */
    deactivatedAt: t.string({
      nullable: true,
      resolve: (m) => m.deactivatedAt?.toISOString() ?? null,
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
    /** Members-only Markdown (2026-09-30). Already null for anyone who
     * fails canSeeContactDetails — stripped in personForViewer. */
    contactDetailsHtml: t.string({
      nullable: true,
      resolve: (p) =>
        p.contactDetails ? renderMarkdown(p.contactDetails) : null,
    }),
    contactDetails: t.exposeString("contactDetails", { nullable: true }),
    /** Set while deactivated (member-deactivation, 2026-09-10). Only
     * admin viewers ever receive a deactivated person, so exposing the
     * stamp adds nothing for the public. */
    deactivatedAt: t.string({
      nullable: true,
      resolve: (p) => p.deactivatedAt?.toISOString() ?? null,
    }),
    /** Published topics this person hosts (QA #59 — People page cards). */
    publishedTopics: t.field({
      type: [PersonTopicType],
      resolve: (p) => p.publishedTopics ?? [],
    }),
  }),
});

/** Non-admins don't get to see who owns the forum (launch QA 2026-07-25):
 * the owner role is stripped from profiles before they leave the API, so
 * the Owner pill (People page, person pages, host card) only renders for
 * admin viewers. */
function withPublicRoles(person: Person, viewer: Viewer): Person {
  if (canModerate(viewer)) return person;
  return {
    ...person,
    roles: person.roles.filter((r) => r !== "owner"),
  };
}

/** A person as this viewer may see them, or null if not at all: the
 * privacy-level profile rule, then member-deactivation (2026-09-10) —
 * deactivated members are admin-eyes-only, listed apart on the People
 * page for admins and simply gone for everyone else — then the
 * members-only Contact Details strip (2026-09-30), then the owner strip. The one gate for both `forumPeople` and `person`. */
function personForViewer(
  person: Person,
  privacy: Privacy,
  viewer: Viewer,
): Person | null {
  if (!canSeePersonProfile(privacy, viewer, person.roles as SharedRole[])) {
    return null;
  }
  if (person.deactivatedAt && !canModerate(viewer)) return null;
  const visible = canSeeContactDetails(viewer)
    ? person
    : { ...person, contactDetails: null };
  return withPublicRoles(visible, viewer);
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
  forumPeople: t.field({
    type: [PersonType],
    args: { idOrSlug: t.arg.string({ required: true }) },
    resolve: async (_p, args, ctx) => {
      const readable = await readTimetable(ctx, args.idOrSlug);
      if (!readable) return [];
      const viewer = { userId: ctx.user?.id ?? null, roles: readable.roles };
      const people = await listPeople(readable.timetable.id);
      const privacy = readable.timetable.privacy as Privacy;
      return people.flatMap((p) => personForViewer(p, privacy, viewer) ?? []);
    },
  }),

  /** One member's public profile — powers the person pages and (with no
   * user args) the viewer's own per-forum profile editor.
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
      if (!person) return null;
      return personForViewer(
        person,
        readable.timetable.privacy as Privacy,
        viewer,
      );
    },
  }),

  forumMembers: t.field({
    type: [MemberType],
    args: { forumId: t.arg.string({ required: true }) },
    resolve: async (_p, args, ctx) => {
      const viewer = await ctx.getViewer(args.forumId);
      if (!canManageMembers(viewer)) return [];
      const members = await listMembers(args.forumId);
      return members.map((m) => ({
        membershipId: m.membershipId,
        roles: m.roles as string[],
        inviteSentAt: m.inviteSentAt,
        deactivatedAt: m.deactivatedAt,
        user: m.user,
      }));
    },
  }),
}));

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/** Digest v2 (2026-07-29) arg guards — invalid values are ignored, not
 * errors, matching the mutation's leave-unchanged-when-absent semantics. */
function validDigestFrequency(
  value: string | null | undefined,
): "daily" | "weekly" | undefined {
  return value === "daily" || value === "weekly" ? value : undefined;
}
function validDigestWeekday(
  value: number | null | undefined,
): number | undefined {
  return value != null && Number.isInteger(value) && value >= 0 && value <= 6
    ? value
    : undefined;
}
/** Per-forum digest switches (2026-08-11): a JSON {kind: boolean} object.
 * The parsed object REPLACES the stored set (the form always sends every
 * switch); unknown kinds are dropped, malformed JSON yields undefined. */
export function parseDigestKinds(
  raw: string | null | undefined,
): DigestKinds | undefined {
  if (!raw) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return undefined;
  }
  const kinds: DigestKinds = {};
  for (const kind of DIGEST_KINDS) {
    const value = (parsed as Record<string, unknown>)[kind];
    if (typeof value === "boolean") kinds[kind] = value;
  }
  return kinds;
}

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
        payload: {
          targetUserId: target.userId,
          targetName: target.name,
          // Roles at preview time — the log line reads "previewed the
          // forum as <name> <role>" (Ed, 2026-08-17).
          targetRoles: target.roles,
        },
      });
      return true;
    },
  }),

  /** Ends the view-as preview. The START is logged (member.impersonate);
   * the end is not — it's a guaranteed follow-up that only added noise to
   * the log (QA 2026-07-30). Kept as the client's end-of-preview signal. */
  stopUserPreview: t.boolean({
    args: {
      idOrSlug: t.arg.string({ required: true }),
      userId: t.arg.string({ required: true }),
    },
    resolve: async (_p, args, ctx) => {
      const { viewer } = await loadTimetableAndViewer(ctx, args.idOrSlug);
      if (!canModerate(viewer)) forbidden("Admins only");
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
      /** Omit to leave unchanged; empty string clears. */
      contactDetails: t.arg.string({ required: false }),
      image: t.arg.string({ required: false }),
    },
    resolve: async (_p, args, ctx) => {
      capLength(args.name, 120, "Name");
      capLength(args.bio, BIO_MAX_LENGTH, "Bio");
      capLength(
        args.contactDetails,
        CONTACT_DETAILS_MAX_LENGTH,
        "Contact Details",
      );
      assertOptionalHttpUrl(args.image, "Image URL");
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
          contactDetails:
            args.contactDetails != null
              ? args.contactDetails.trim() || null
              : undefined,
          image: args.image != null ? args.image.trim() || null : undefined,
        },
      );
      if (!updated) notFound("Membership not found");
      await logActivity({
        timetableId: readable.timetable.id,
        actorId: user.id,
        action: "member.profile_edit",
      });
      return getPerson(readable.timetable.id, user.id);
    },
  }),

  /** Update the current user's digest preferences (no sends yet). */
  updateMyNotificationSettings: t.field({
    type: UserType,
    args: {
      /** The master switch — off means no digest at all. */
      digestEnabled: t.arg.boolean({ required: false }),
      /** "daily" or "weekly" (digest v2, 2026-07-29). */
      digestFrequency: t.arg.string({ required: false }),
      /** Weekly send day, 0 = Sunday … 6 = Saturday (UTC). */
      digestWeekday: t.arg.int({ required: false }),
      newForumEmails: t.arg.boolean({ required: false }),
    },
    resolve: async (_p, args, ctx) => {
      const user = await requireUser(ctx);
      const frequency = validDigestFrequency(args.digestFrequency);
      const weekday = validDigestWeekday(args.digestWeekday);
      const updated = await updateUserNotificationSettings(user.id, {
        ...(args.digestEnabled != null
          ? { digestEnabled: args.digestEnabled }
          : {}),
        ...(frequency ? { digestFrequency: frequency } : {}),
        ...(weekday != null ? { digestWeekday: weekday } : {}),
        // Harmless for non-sysadmins to set — the sender only ever mails
        // addresses on the SYSADMIN_EMAILS list.
        ...(args.newForumEmails != null
          ? { newForumEmails: args.newForumEmails }
          : {}),
      });
      if (!updated) notFound("User not found");
      return {
        id: updated.id,
        email: updated.email,
        name: updated.name,
        image: updated.image,
      };
    },
  }),
}));

builder.mutationFields((t) => ({
  /** Update the viewer's PER-FORUM digest settings (2026-08-11) — the
   * digest is one email per forum, so on/off, cadence, AND the kind
   * switches are all membership settings. Absent args leave their stored
   * value; kindsJson (a {kind: boolean} object) replaces the stored set. */
  updateMyForumDigestSettings: t.field({
    type: "Boolean",
    args: {
      idOrSlug: t.arg.string({ required: true }),
      enabled: t.arg.boolean({ required: false }),
      /** "daily" or "weekly". */
      frequency: t.arg.string({ required: false }),
      /** Weekly send day, 0 = Sunday … 6 = Saturday (UTC). */
      weekday: t.arg.int({ required: false }),
      kindsJson: t.arg.string({ required: false }),
    },
    resolve: async (_p, args, ctx) => {
      const { user, readable } = await loadTimetableAndViewer(
        ctx,
        args.idOrSlug,
      );
      const frequency = validDigestFrequency(args.frequency);
      const weekday = validDigestWeekday(args.weekday);
      const kinds = parseDigestKinds(args.kindsJson);
      return updateMembershipDigestSettings(readable.timetable.id, user.id, {
        ...(args.enabled != null ? { enabled: args.enabled } : {}),
        ...(frequency ? { frequency } : {}),
        ...(weekday != null ? { weekday } : {}),
        ...(kinds ? { kinds } : {}),
      });
    },
  }),

  /** Admin: edit any member's per-forum profile — bio (QA #42 — bios are
   * editable from the Members section in Settings), profile image
   * (production QA) and name (2026-08-27). Same fields the member's own
   * updateMyProfile edits. Logged to the activity feed.
   * (Mutation name kept for compatibility.) */
  updateMemberBio: t.field({
    type: PersonType,
    nullable: true,
    args: {
      idOrSlug: t.arg.string({ required: true }),
      userId: t.arg.string({ required: true }),
      bio: t.arg.string({ required: true }),
      /** Omit to leave unchanged; empty string clears. */
      contactDetails: t.arg.string({ required: false }),
      /** Omit to leave unchanged; empty string clears. */
      image: t.arg.string({ required: false }),
      /** Omit (or blank) to leave unchanged — a member can be renamed, but
       * not renamed to nothing. Renaming re-derives their member slug. */
      name: t.arg.string({ required: false }),
    },
    resolve: async (_p, args, ctx) => {
      capLength(args.bio, BIO_MAX_LENGTH, "Bio");
      capLength(
        args.contactDetails,
        CONTACT_DETAILS_MAX_LENGTH,
        "Contact Details",
      );
      capLength(args.name, 120, "Name");
      assertOptionalHttpUrl(args.image, "Image URL");
      const { user, readable } = await requireAdminTimetable(
        ctx,
        args.idOrSlug,
      );
      const target = await getPerson(readable.timetable.id, args.userId);
      if (!target) notFound("Member not found");
      const name = args.name?.trim() || undefined;
      await updateMemberProfile(readable.timetable.id, args.userId, {
        bio: args.bio.trim() || null,
        ...(args.contactDetails != null
          ? { contactDetails: args.contactDetails.trim() || null }
          : {}),
        ...(args.image != null ? { image: args.image.trim() || null } : {}),
        ...(name != null ? { name } : {}),
      });
      await logActivity({
        timetableId: readable.timetable.id,
        actorId: user.id,
        action: "member.bio_edit",
        // The name AFTER the edit — the timeline chip should read as the
        // person you'd look for today, not their old name.
        payload: { userId: args.userId, name: name ?? target.name },
      });
      return getPerson(readable.timetable.id, args.userId);
    },
  }),
}));
