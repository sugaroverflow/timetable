import { Router, type NextFunction, type Request, type Response } from "express";

import {
  computeUserDigest,
  createTimetable,
  getMembershipById,
  getReadableTimetable,
  getSlotsForIcs,
  getTimetableById,
  getUserByIcsToken,
  inviteEmails,
  isDigestEmpty,
  listDigestRecipients,
  markDigestSent,
  setMemberRoles,
} from "@timetable/core";
import {
  canManageMembers,
  createTimetableSchema,
  inviteSchema,
  updateMemberRolesSchema,
  type Role,
} from "@timetable/shared";

import { buildContext } from "../context";
import { renderDigest, sendEmail } from "../email";
import { getRequestId, logRequestError } from "../http/request-log";
import { buildIcs } from "../ics";

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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
restRouter.use(
  (err: unknown, req: Request, res: Response, _next: NextFunction) => {
    logRequestError(req, err, { component: "rest" });
    res
      .status(500)
      .json({ error: "Internal server error", requestId: getRequestId(req) });
  },
);
