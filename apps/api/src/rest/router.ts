import {
  Router,
  type NextFunction,
  type Request,
  type Response,
} from "express";

import {
  computeUserDigest,
  createLocalUser,
  createTimetable,
  getMembership,
  getMembershipById,
  getReadableTimetable,
  getSlotsForIcs,
  getTimetableById,
  getUserById,
  getUserByIcsToken,
  inviteEmails,
  isDigestEmpty,
  listDigestRecipients,
  listHostTopics,
  markDigestSent,
  markInviteSent,
  removeMembership,
  setMemberRoles,
} from "@timetable/core";
import {
  addPersonSchema,
  canEditSettings,
  canManageMembers,
  canModerate,
  canProposeTopics,
  createTimetableSchema,
  inviteSchema,
  updateMemberRolesSchema,
  type Role,
} from "@timetable/shared";

import { getOrCreateClerkUser } from "../auth/clerk";
import { buildContext } from "../context";
import { renderDigest, renderInvite, sendEmail } from "../email";
import { getRequestId, logRequestError } from "../http/request-log";
import { buildIcs } from "../ics";
import {
  createSignedUpload,
  isUploadPurpose,
  UploadsNotConfiguredError,
  UploadValidationError,
} from "../uploads/storage";

export const restRouter: Router = Router();

/** Wrap async handlers so rejections reach the error middleware. */
function h(
  fn: (req: Request, res: Response) => Promise<void>,
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    fn(req, res).catch(next);
  };
}

function contextFromRequest(req: Request) {
  return buildContext({
    authHeader: req.headers.authorization,
    cookieHeader: req.headers.cookie,
  });
}

/**
 * POST /api/timetables
 * Create a timetable; the creator becomes owner + admin.
 */
restRouter.post(
  "/timetables",
  h(async (req, res) => {
    const ctx = await contextFromRequest(req);
    if (!ctx.user) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const parsed = createTimetableSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: "Invalid input", details: parsed.error.flatten() });
      return;
    }

    const timetable = await createTimetable(ctx.user.id, parsed.data);
    res.status(201).json(timetable);
  }),
);

/**
 * POST /api/timetables/:id/invites
 * Admin-only. Adds existing users immediately, queues invites for unknown emails.
 */
restRouter.post(
  "/timetables/:id/invites",
  h(async (req, res) => {
    const ctx = await contextFromRequest(req);
    if (!ctx.user) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const timetableId = req.params.id as string;
    const viewer = await ctx.getViewer(timetableId);
    if (!canManageMembers(viewer)) {
      res.status(403).json({ error: "Admins only" });
      return;
    }

    const parsed = inviteSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: "Invalid input", details: parsed.error.flatten() });
      return;
    }

    const results = await inviteEmails(
      timetableId,
      ctx.user.id,
      parsed.data.emails,
      parsed.data.roles,
    );
    res.json({ results });
  }),
);

/**
 * POST /api/timetables/:id/people
 * Admin pre-creates an account (product feedback round 2): a Clerk user and
 * local row exist immediately so the admin can populate profile/topics, but
 * NO email is sent — that's the separate invite endpoint below.
 */
restRouter.post(
  "/timetables/:id/people",
  h(async (req, res) => {
    const ctx = await contextFromRequest(req);
    if (!ctx.user) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const timetableId = req.params.id as string;
    const viewer = await ctx.getViewer(timetableId);
    if (!canManageMembers(viewer)) {
      res.status(403).json({ error: "Admins only" });
      return;
    }

    const parsed = addPersonSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: "Invalid input", details: parsed.error.flatten() });
      return;
    }

    const email = parsed.data.email.trim().toLowerCase();
    const clerkUser = await getOrCreateClerkUser(
      email,
      parsed.data.name ?? null,
    );
    await createLocalUser({
      id: clerkUser.id,
      email,
      name: parsed.data.name ?? null,
    });
    // The local row now exists, so inviteEmails attaches the membership
    // immediately (merging roles if they were already a member).
    const [outcome] = await inviteEmails(
      timetableId,
      ctx.user.id,
      [email],
      parsed.data.roles,
    );
    const membership = await getMembership(timetableId, clerkUser.id);

    res.json({
      userId: clerkUser.id,
      membershipId: membership?.id ?? null,
      accountCreated: clerkUser.created,
      status: outcome?.status ?? "added",
    });
  }),
);

/**
 * POST /api/memberships/:id/invite
 * Send (or resend) the invite email for a member — the explicit final step
 * after the admin has populated the account. Records inviteSentAt.
 */
restRouter.post(
  "/memberships/:id/invite",
  h(async (req, res) => {
    const ctx = await contextFromRequest(req);
    if (!ctx.user) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const membership = await getMembershipById(req.params.id as string);
    if (!membership) {
      res.status(404).json({ error: "Membership not found" });
      return;
    }
    const viewer = await ctx.getViewer(membership.timetableId);
    if (!canManageMembers(viewer)) {
      res.status(403).json({ error: "Admins only" });
      return;
    }

    const [member, timetable] = await Promise.all([
      getUserById(membership.userId),
      getTimetableById(membership.timetableId),
    ]);
    if (!member?.email || !timetable) {
      res.status(400).json({ error: "Member has no email address" });
      return;
    }

    const topics = await listHostTopics(membership.timetableId, member.id);
    const { subject, html } = renderInvite({
      timetableName: timetable.name,
      timetableSlug: timetable.slug,
      inviteeName: member.name,
      inviterName: ctx.user.name,
      topicsCount: topics.length,
    });
    await sendEmail({ to: member.email, subject, html });

    const sentAt = new Date();
    await markInviteSent(membership.id, sentAt);
    res.json({ sentAt: sentAt.toISOString() });
  }),
);

/**
 * PATCH /api/memberships/:id/roles
 * Admin-only role assignment. Protects the timetable owner's owner/admin roles
 * and prevents granting "owner" to anyone else via this endpoint.
 */
restRouter.patch(
  "/memberships/:id/roles",
  h(async (req, res) => {
    const ctx = await contextFromRequest(req);
    if (!ctx.user) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const membership = await getMembershipById(req.params.id as string);
    if (!membership) {
      res.status(404).json({ error: "Membership not found" });
      return;
    }

    const viewer = await ctx.getViewer(membership.timetableId);
    if (!canManageMembers(viewer)) {
      res.status(403).json({ error: "Admins only" });
      return;
    }

    const parsed = updateMemberRolesSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: "Invalid input", details: parsed.error.flatten() });
      return;
    }

    const timetable = await getTimetableById(membership.timetableId);
    let roles: Role[] = parsed.data.roles;
    if (timetable && membership.userId === timetable.ownerId) {
      // The owner always keeps owner + admin.
      roles = Array.from(new Set<Role>([...roles, "owner", "admin"]));
    } else {
      // Only the owner is "owner"; never grant it through this endpoint.
      roles = roles.filter((r) => r !== "owner");
    }

    const updated = await setMemberRoles(membership.id, roles);
    res.json(updated);
  }),
);

/**
 * DELETE /api/memberships/:id
 * Admin-only removal from the timetable (QA #59 round 3 — People page).
 * The timetable owner can never be removed.
 */
restRouter.delete(
  "/memberships/:id",
  h(async (req, res) => {
    const ctx = await contextFromRequest(req);
    if (!ctx.user) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const membership = await getMembershipById(req.params.id as string);
    if (!membership) {
      res.status(404).json({ error: "Membership not found" });
      return;
    }

    const viewer = await ctx.getViewer(membership.timetableId);
    if (!canManageMembers(viewer)) {
      res.status(403).json({ error: "Admins only" });
      return;
    }

    const timetable = await getTimetableById(membership.timetableId);
    if (timetable && membership.userId === timetable.ownerId) {
      res.status(400).json({ error: "The owner can't be removed" });
      return;
    }

    await removeMembership(membership, ctx.user.id);
    res.json({ removed: true });
  }),
);

/**
 * POST /api/uploads
 * Return a short-lived signed PUT URL for direct browser uploads to
 * S3-compatible object storage. The returned publicUrl is then saved through
 * the existing profile/topic/settings mutations.
 */
restRouter.post(
  "/uploads",
  h(async (req, res) => {
    const ctx = await contextFromRequest(req);
    if (!ctx.user) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const body = req.body as {
      purpose?: unknown;
      filename?: unknown;
      contentType?: unknown;
      size?: unknown;
      timetableIdOrSlug?: unknown;
    };

    if (!isUploadPurpose(body.purpose)) {
      res.status(400).json({ error: "Invalid upload purpose" });
      return;
    }

    let uploadTimetableId: string | undefined;
    if (body.purpose === "topic-cover" || body.purpose === "timetable-cover") {
      if (
        typeof body.timetableIdOrSlug !== "string" ||
        !body.timetableIdOrSlug.trim()
      ) {
        res.status(400).json({ error: "Timetable is required" });
        return;
      }
      const readable = await getReadableTimetable(
        ctx.user.id,
        body.timetableIdOrSlug.trim(),
      );
      if (!readable) {
        res.status(404).json({ error: "Timetable not found" });
        return;
      }
      uploadTimetableId = readable.timetable.id;
      const viewer = { userId: ctx.user.id, roles: readable.roles };
      if (
        body.purpose === "topic-cover" &&
        !(canProposeTopics(viewer) || canModerate(viewer))
      ) {
        res.status(403).json({ error: "Hosts only" });
        return;
      }
      if (body.purpose === "timetable-cover" && !canEditSettings(viewer)) {
        res.status(403).json({ error: "Admins only" });
        return;
      }
    }

    try {
      const upload = await createSignedUpload({
        purpose: body.purpose,
        userId: ctx.user.id,
        timetableId: uploadTimetableId,
        filename: body.filename,
        contentType: body.contentType,
        size: body.size,
      });
      res.json(upload);
    } catch (err) {
      if (err instanceof UploadsNotConfiguredError) {
        res.status(503).json({ error: "Object storage is not configured" });
        return;
      }
      if (err instanceof UploadValidationError) {
        res.status(400).json({ error: err.message });
        return;
      }
      throw err;
    }
  }),
);

/**
 * POST /api/jobs/digests
 * Cron-triggered. Computes and sends per-user email digests. Protected by the
 * `x-cron-secret` header matching the CRON_SECRET env var.
 */
restRouter.post(
  "/jobs/digests",
  h(async (req, res) => {
    const secret = process.env.CRON_SECRET;
    if (!secret) {
      res
        .status(503)
        .json({ error: "Digests not configured (CRON_SECRET unset)" });
      return;
    }
    if (req.headers["x-cron-secret"] !== secret) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const now = new Date();
    const dayMs = 24 * 60 * 60 * 1000;
    const recipients = await listDigestRecipients();
    let sent = 0;

    for (const recipient of recipients) {
      const since = recipient.lastDigestAt ?? new Date(now.getTime() - dayMs);
      const digest = await computeUserDigest(recipient, since);
      if (!isDigestEmpty(digest) && digest.email) {
        const { subject, html } = renderDigest(digest);
        await sendEmail({ to: digest.email, subject, html });
        sent += 1;
      }
      await markDigestSent(recipient.id, now);
    }

    res.json({ processed: recipients.length, sent });
  }),
);

/**
 * GET /api/timetables/:idOrSlug/calendar.ics
 * ICS feed of the timetable's slots. Public timetables need no auth; private
 * ones require ?token=<user.icsToken> from a member.
 */
restRouter.get(
  "/timetables/:idOrSlug/calendar.ics",
  h(async (req, res) => {
    const idOrSlug = req.params.idOrSlug as string;
    const token =
      typeof req.query.token === "string" ? req.query.token : undefined;

    let userId: string | null = null;
    if (token) {
      const user = await getUserByIcsToken(token);
      userId = user?.id ?? null;
    }

    const readable = await getReadableTimetable(userId, idOrSlug);
    if (!readable) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const slots = await getSlotsForIcs(readable.timetable.id);
    const ics = buildIcs(readable.timetable.name, slots);
    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${readable.timetable.slug}.ics"`,
    );
    res.send(ics);
  }),
);

restRouter.use(
  (err: unknown, req: Request, res: Response, _next: NextFunction) => {
    logRequestError(req, err, { component: "rest" });
    res
      .status(500)
      .json({ error: "Internal server error", requestId: getRequestId(req) });
  },
);
