import {
  Router,
  type NextFunction,
  type Request,
  type Response,
} from "express";

import {
  buildDataExport,
  computeUserForumDigests,
  createLocalUser,
  createTimetable,
  deleteForum,
  buildFeed,
  getMembership,
  getUsersByEmails,
  logActivity,
  getMembershipById,
  getPerson,
  getReadableTimetable,
  getSlotsForIcs,
  getTimetableById,
  getUserById,
  getUserByIcsToken,
  inviteEmails,
  listDigestRecipients,
  listHostTopics,
  markForumDigestsSent,
  markInviteSent,
  recordDigestSend,
  removeMembership,
  setMemberRoles,
  updateUserEmail,
} from "@timetable/core";
import {
  addPersonSchema,
  canEditSettings,
  canManageMembers,
  canModerate,
  canProposeTopics,
  createTimetableSchema,
  inviteSchema,
  isCalendarEnabled,
  normalizeEmail,
  officeHoursLabel,
  updateMemberEmailSchema,
  updateMemberRolesSchema,
  type Role,
  type TimetableSettings,
} from "@timetable/shared";

import { buildAtomFeed } from "../atom";
import {
  createSignInTicket,
  getOrCreateClerkUser,
  replaceClerkEmail,
} from "../auth/clerk";
import { isSysadmin } from "../auth/sysadmin";
import { buildContext, type ApiContext } from "../context";
import {
  linkBase,
  renderDigest,
  renderInvite,
  renderNewForum,
  sendEmail,
  stampDigestLinks,
  wrapLinksWithSignInTicket,
} from "../email";
import { sampleDigest } from "../email-sample";
import { env } from "../env";
import { enforceActionLimit } from "../http/action-limits";
import {
  getRequestId,
  logRequestError,
  structuredLogger,
} from "../http/request-log";
import { buildIcs } from "../ics";
import { renderMarkdown } from "../markdown";
import {
  createSignedUpload,
  isUploadPurpose,
  UploadsNotConfiguredError,
  UploadValidationError,
  type UploadPurpose,
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

/** REST acts as the signed-in session only. Do NOT pass `allowApiToken` here:
 * personal-token scopes are enforced by a GraphQL plugin that never sees a
 * REST request, so accepting a token on this surface would hand any token the
 * whole admin API (invites, roles, uploads, export) unscoped. */
function contextFromRequest(req: Request) {
  return buildContext({
    authHeader: req.headers.authorization,
    cookieHeader: req.headers.cookie,
  });
}

/** Send the 401 for unauthenticated requests; returns the user or null. */
function requireUserCtx(ctx: ApiContext, res: Response) {
  if (!ctx.user) {
    res.status(401).json({ error: "Not authenticated" });
    return null;
  }
  return ctx.user;
}

/** Load a membership by id (404 when missing) and require member-management
 * rights on its timetable (403 otherwise). Null after an error was sent. */
async function requireAdminMembership(
  ctx: ApiContext,
  membershipId: string,
  res: Response,
) {
  const membership = await getMembershipById(membershipId);
  if (!membership) {
    res.status(404).json({ error: "Membership not found" });
    return null;
  }
  const viewer = await ctx.getViewer(membership.timetableId);
  if (!canManageMembers(viewer)) {
    res.status(403).json({ error: "Admins only" });
    return null;
  }
  return { membership, viewer };
}

/** Validate a request body; sends the 400 and returns null when invalid. */
function parseBody<T>(
  schema: {
    safeParse: (
      input: unknown,
    ) =>
      | { success: true; data: T }
      | { success: false; error: { flatten: () => unknown } };
  },
  req: Request,
  res: Response,
): T | null {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res
      .status(400)
      .json({ error: "Invalid input", details: parsed.error.flatten() });
    return null;
  }
  return parsed.data;
}

/**
 * POST /api/forums
 * Create a timetable; the creator becomes owner + admin.
 */
restRouter.post(
  "/forums",
  h(async (req, res) => {
    const ctx = await contextFromRequest(req);
    const user = requireUserCtx(ctx, res);
    if (!user) return;

    const input = parseBody(createTimetableSchema, req, res);
    if (!input) return;

    const timetable = await createTimetable(user.id, input);
    // Notify opted-in sysadmins — fire-and-forget so an email hiccup can
    // never fail forum creation.
    void notifySysadminsOfNewForum({
      forumName: timetable.name,
      forumSlug: timetable.slug,
      ownerName: user.name,
      ownerEmail: user.email,
    }).catch((err) => {
      logRequestError(req, err, { component: "new-forum-email" });
    });
    res.status(201).json(timetable);
  }),
);

/** Email each SYSADMIN_EMAILS account that opted in (newForumEmails). */
async function notifySysadminsOfNewForum(args: {
  forumName: string;
  forumSlug: string;
  ownerName: string | null;
  ownerEmail: string | null;
}): Promise<void> {
  const sysadmins = await getUsersByEmails(env.sysadminEmails);
  const recipients = sysadmins.filter(
    (u) => u.email && u.notificationSettings.newForumEmails === true,
  );
  if (recipients.length === 0) return;
  const { subject, html } = renderNewForum(args);
  await Promise.all(
    recipients.map((u) => sendEmail({ to: u.email!, subject, html })),
  );
}

/**
 * DELETE /api/forums/:id
 * Sysadmin-only (SYSADMIN_EMAILS): hard-deletes the forum; memberships,
 * invites, topics, comments, hearts, activity, and timeslots cascade.
 */
restRouter.delete(
  "/forums/:id",
  h(async (req, res) => {
    const ctx = await contextFromRequest(req);
    const user = requireUserCtx(ctx, res);
    if (!user) return;
    if (!isSysadmin(user)) {
      res.status(403).json({ error: "Sysadmins only" });
      return;
    }
    const deleted = await deleteForum(req.params.id as string);
    if (!deleted) {
      res.status(404).json({ error: "Forum not found" });
      return;
    }
    structuredLogger("sysadmin").info(
      `${user.email} deleted forum "${deleted.name}" (${deleted.slug}, ${deleted.id})`,
    );
    res.json({ deleted: true, name: deleted.name, slug: deleted.slug });
  }),
);

/**
 * GET /api/forums/:idOrSlug/export
 * Read-only, role-filtered JSON dump of everything the viewer can read —
 * the download behind the forum's "API" page. Any reader (anonymous
 * included on public forums); the shape is documented in core/export.ts.
 */
restRouter.get(
  "/forums/:idOrSlug/export",
  h(async (req, res) => {
    const ctx = await contextFromRequest(req);
    const readable = await getReadableTimetable(
      ctx.user?.id ?? null,
      req.params.idOrSlug as string,
    );
    if (!readable) {
      res.status(404).json({ error: "Forum not found" });
      return;
    }
    const data = await buildDataExport(readable.timetable, {
      userId: ctx.user?.id ?? null,
      roles: readable.roles,
    });
    const stamp = data.forum.exportedAt.slice(0, 10);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${readable.timetable.slug}-export-${stamp}.json"`,
    );
    res.json(data);
  }),
);

/**
 * POST /api/forums/:id/invites
 * Admin-only. Adds existing users immediately, queues invites for unknown emails.
 */
restRouter.post(
  "/forums/:id/invites",
  h(async (req, res) => {
    const ctx = await contextFromRequest(req);
    const user = requireUserCtx(ctx, res);
    if (!user) return;

    const timetableId = req.params.id as string;
    const viewer = await ctx.getViewer(timetableId);
    if (!canManageMembers(viewer)) {
      res.status(403).json({ error: "Admins only" });
      return;
    }

    const input = parseBody(inviteSchema, req, res);
    if (!input) return;
    // Each address can become an invite email, so spend one unit per
    // recipient — a pasted cohort is fine, a runaway loop is not.
    if (
      !(await enforceActionLimit(res, user.id, "invite", input.emails.length))
    )
      return;

    const results = await inviteEmails(
      timetableId,
      user.id,
      input.emails,
      input.roles,
    );
    res.json({ results });
  }),
);

/**
 * POST /api/forums/:id/people
 * Admin pre-creates an account (product feedback round 2): a Clerk user and
 * local row exist immediately so the admin can populate profile/topics, but
 * NO email is sent — that's the separate invite endpoint below.
 */
restRouter.post(
  "/forums/:id/people",
  h(async (req, res) => {
    const ctx = await contextFromRequest(req);
    const user = requireUserCtx(ctx, res);
    if (!user) return;

    const timetableId = req.params.id as string;
    const viewer = await ctx.getViewer(timetableId);
    if (!canManageMembers(viewer)) {
      res.status(403).json({ error: "Admins only" });
      return;
    }

    const input = parseBody(addPersonSchema, req, res);
    if (!input) return;
    if (!(await enforceActionLimit(res, user.id, "invite"))) return;

    const email = normalizeEmail(input.email);
    const clerkUser = await getOrCreateClerkUser(email, input.name ?? null);
    await createLocalUser({
      id: clerkUser.id,
      email,
      name: input.name ?? null,
    });
    // The local row now exists, so inviteEmails attaches the membership
    // immediately (merging roles if they were already a member).
    const [outcome] = await inviteEmails(
      timetableId,
      user.id,
      [email],
      input.roles,
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
 * PATCH /api/memberships/:id/email
 * Admin email correction (2026-07-29) for members who have NEVER signed
 * in — pre-created accounts and invite typos. After first sign-in the
 * address is the member's own credential (409). Updates Clerk (verified +
 * primary, old addresses removed) then the local mirror, and logs it.
 */
restRouter.patch(
  "/memberships/:id/email",
  h(async (req, res) => {
    const ctx = await contextFromRequest(req);
    const user = requireUserCtx(ctx, res);
    if (!user) return;
    const admin = await requireAdminMembership(
      ctx,
      req.params.id as string,
      res,
    );
    if (!admin) return;
    const input = parseBody(updateMemberEmailSchema, req, res);
    if (!input) return;

    const { membership } = admin;
    try {
      const outcome = await replaceClerkEmail(membership.userId, input.email);
      if (outcome === "signed_in") {
        res.status(409).json({
          error:
            "This member has signed in — the email is their login credential now, and only they can change it (Account & security).",
        });
        return;
      }
    } catch (err) {
      logRequestError(req, err, { component: "member-email-change" });
      const detail =
        err instanceof Error ? err.message.slice(0, 300) : "unknown error";
      res.status(502).json({
        error: `Could not update the login email — it may already belong to another account. (${detail})`,
      });
      return;
    }
    await updateUserEmail(membership.userId, input.email);
    await logActivity({
      timetableId: membership.timetableId,
      actorId: user.id,
      action: "member.email_change",
      payload: { targetUserId: membership.userId },
      note: `Login email changed to ${normalizeEmail(input.email)}`,
    });
    res.json({ email: normalizeEmail(input.email) });
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
    const user = requireUserCtx(ctx, res);
    if (!user) return;

    const admin = await requireAdminMembership(
      ctx,
      req.params.id as string,
      res,
    );
    if (!admin) return;
    const { membership } = admin;

    const [member, timetable, inviter] = await Promise.all([
      getUserById(membership.userId),
      getTimetableById(membership.timetableId),
      getPerson(membership.timetableId, user.id),
    ]);
    if (!member?.email || !timetable) {
      res.status(400).json({ error: "Member has no email address" });
      return;
    }
    if (!(await enforceActionLimit(res, user.id, "invite"))) return;

    const topics = await listHostTopics(membership.timetableId, member.id);
    const { subject, html } = renderInvite({
      timetableName: timetable.name,
      timetableSlug: timetable.slug,
      // Per-forum profiles: both names come from this forum's memberships.
      inviteeName: membership.name,
      inviterName: inviter?.name ?? user.name,
      topicsCount: topics.length,
      signInTicket: await createSignInTicket(member.id),
    });
    try {
      await sendEmail({ to: member.email, subject, html });
    } catch (err) {
      // Surface the provider's reason instead of a bare 500 (prod QA
      // 2026-07-27) — Resend rejections name the actual problem
      // (unverified from-domain, invalid address, bad key).
      console.error("[invite] email send failed:", err);
      const detail =
        err instanceof Error ? err.message.slice(0, 300) : "unknown error";
      res.status(502).json({
        error: `The invite email could not be sent — check the member's address and the email configuration. (${detail})`,
      });
      return;
    }

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
    const user = requireUserCtx(ctx, res);
    if (!user) return;

    const admin = await requireAdminMembership(
      ctx,
      req.params.id as string,
      res,
    );
    if (!admin) return;
    const { membership } = admin;

    const input = parseBody(updateMemberRolesSchema, req, res);
    if (!input) return;

    const timetable = await getTimetableById(membership.timetableId);
    let roles: Role[] = input.roles;
    if (timetable && membership.userId === timetable.ownerId) {
      // The owner always keeps owner + admin.
      roles = Array.from(new Set<Role>([...roles, "owner", "admin"]));
    } else {
      // Only the owner is "owner"; never grant it through this endpoint.
      roles = roles.filter((r) => r !== "owner");
    }

    const updated = await setMemberRoles(membership.id, roles);
    // Permission changes are audit-worthy — log unless nothing changed.
    const before = [...membership.roles].sort().join(",");
    const after = [...roles].sort().join(",");
    if (before !== after) {
      await logActivity({
        timetableId: membership.timetableId,
        actorId: user.id,
        action: "member.role_change",
        payload: {
          targetUserId: membership.userId,
          from: membership.roles,
          to: roles,
        },
        note: `Roles set to ${roles.join(", ") || "none"}`,
      });
    }
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
    const user = requireUserCtx(ctx, res);
    if (!user) return;

    const admin = await requireAdminMembership(
      ctx,
      req.params.id as string,
      res,
    );
    if (!admin) return;
    const { membership } = admin;

    const timetable = await getTimetableById(membership.timetableId);
    if (timetable && membership.userId === timetable.ownerId) {
      res.status(400).json({ error: "The owner can't be removed" });
      return;
    }

    await removeMembership(membership, user.id);
    res.json({ removed: true });
  }),
);

type UploadAuth =
  | { ok: true; timetableId?: string }
  | { ok: false; status: number; error: string };

/** Cover uploads target a timetable: resolve it and check the viewer's
 * role there (hosts for topic covers, admins for the timetable cover).
 * Other purposes need no timetable. */
async function authorizeUpload(
  userId: string,
  purpose: UploadPurpose,
  timetableIdOrSlug: unknown,
): Promise<UploadAuth> {
  if (purpose !== "topic-cover" && purpose !== "timetable-cover") {
    return { ok: true };
  }

  if (typeof timetableIdOrSlug !== "string" || !timetableIdOrSlug.trim()) {
    return { ok: false, status: 400, error: "Timetable is required" };
  }
  const readable = await getReadableTimetable(userId, timetableIdOrSlug.trim());
  if (!readable) {
    return { ok: false, status: 404, error: "Forum not found" };
  }

  const viewer = { userId, roles: readable.roles };
  if (
    purpose === "topic-cover" &&
    !(canProposeTopics(viewer) || canModerate(viewer))
  ) {
    return { ok: false, status: 403, error: "Hosts only" };
  }
  if (purpose === "timetable-cover" && !canEditSettings(viewer)) {
    return { ok: false, status: 403, error: "Admins only" };
  }
  return { ok: true, timetableId: readable.timetable.id };
}

/** Create the signed PUT URL, mapping upload errors to 503/400 responses. */
async function sendSignedUpload(
  res: Response,
  args: Parameters<typeof createSignedUpload>[0],
): Promise<void> {
  try {
    const upload = await createSignedUpload(args);
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
}

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
    const user = requireUserCtx(ctx, res);
    if (!user) return;

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

    const auth = await authorizeUpload(
      user.id,
      body.purpose,
      body.timetableIdOrSlug,
    );
    if (!auth.ok) {
      res.status(auth.status).json({ error: auth.error });
      return;
    }

    await sendSignedUpload(res, {
      purpose: body.purpose,
      userId: user.id,
      timetableId: auth.timetableId,
      filename: body.filename,
      contentType: body.contentType,
      size: body.size,
    });
  }),
);

/** The showcase digest for the test send: the real renderer over sample
 * data, filtered by the forum's configured kind defaults so the admin
 * previews exactly what a default member's digest carries. */
function buildTestDigest(
  user: { email: string; name: string | null },
  timetable: {
    id: string;
    name: string;
    slug: string;
    settings: TimetableSettings | null;
  },
): ReturnType<typeof sampleDigest> {
  return sampleDigest({
    email: user.email,
    name: user.name,
    forumId: timetable.id,
    forumName: timetable.name,
    forumSlug: timetable.slug,
    accent: timetable.settings?.theme?.primary ?? null,
    kindDefaults: timetable.settings?.digestKindDefaults ?? {},
  });
}

/**
 * POST /api/forums/:idOrSlug/digest-test
 * Admin-only: emails the requesting admin a digest built from example
 * notifications (the real renderer over sample data), so the Forum
 * Settings "Send test digest" button shows exactly what members receive.
 */
restRouter.post(
  "/forums/:idOrSlug/digest-test",
  h(async (req, res) => {
    const ctx = await contextFromRequest(req);
    const user = requireUserCtx(ctx, res);
    if (!user) return;
    const readable = await getReadableTimetable(
      user.id,
      req.params.idOrSlug as string,
    );
    if (!readable) {
      res.status(404).json({ error: "Forum not found" });
      return;
    }
    const viewer = await ctx.getViewer(readable.timetable.id);
    if (!canEditSettings(viewer)) {
      res.status(403).json({ error: "Admins only" });
      return;
    }
    if (!user.email) {
      res.status(400).json({ error: "Your account has no email address" });
      return;
    }
    if (!(await enforceActionLimit(res, user.id, "invite"))) return;

    const digest = buildTestDigest(
      { email: user.email, name: user.name },
      readable.timetable,
    );
    const { subject, html } = renderDigest(digest);
    // Test digests get the ticket treatment too, so "Send test digest" QAs
    // the one-click sign-in links exactly as recipients receive them.
    const ticket = await createSignInTicket(user.id);
    try {
      await sendEmail({
        to: user.email,
        subject: `[Test] ${subject}`,
        html: ticket ? wrapLinksWithSignInTicket(html, ticket) : html,
      });
    } catch (err) {
      logRequestError(req, err, { component: "digest-test-email" });
      const detail =
        err instanceof Error ? err.message.slice(0, 300) : "unknown error";
      res.status(502).json({
        error: `The test digest could not be sent — check the email configuration. (${detail})`,
      });
      return;
    }
    res.json({ sentTo: user.email });
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
    // Per-forum digests (2026-08-11): which forums are enabled, due today,
    // and how far back each window reaches all resolve per MEMBERSHIP
    // inside computeUserForumDigests. A skipped (not-due) forum keeps its
    // watermark untouched so its window keeps accumulating.
    const recipients = await listDigestRecipients();
    let sent = 0;
    let processed = 0;

    // Recipients are independent, so process them in concurrent chunks of
    // 10. Failure semantics match the old sequential loop as closely as
    // chunking allows: one recipient's compute/send throwing still aborts
    // the whole run (previously everything after it; now its chunk).
    const chunkSize = 10;
    for (let i = 0; i < recipients.length; i += chunkSize) {
      const chunk = recipients.slice(i, i + chunkSize);
      const results = await Promise.all(
        chunk.map(async (recipient) => {
          // One email per forum with news.
          const { digests, dueForumIds } = await computeUserForumDigests(
            recipient,
            now,
          );
          if (dueForumIds.length === 0) return null;
          let didSend = 0;
          for (const digest of digests) {
            if (!digest.email) continue;
            const { subject, html } = renderDigest(digest);
            // Read tracking (2026-08-13): every link carries the send row's
            // id — one click marks the digest's shown threads seen.
            const sendId = await recordDigestSend(digest, now);
            const stamped = stampDigestLinks(html, sendId);
            // One single-use ticket per email; null (Clerk hiccup) degrades
            // to plain links, never blocks the send.
            const ticket = await createSignInTicket(digest.userId);
            await sendEmail({
              to: digest.email,
              subject,
              html: ticket
                ? wrapLinksWithSignInTicket(stamped, ticket)
                : stamped,
            });
            didSend += 1;
          }
          // Every due forum advances, sent or quiet — matching the old
          // per-user markDigestSent semantics.
          await markForumDigestsSent(recipient.id, dueForumIds, now);
          return didSend;
        }),
      );
      for (const result of results) {
        if (result === null) continue;
        processed += 1;
        sent += result;
      }
    }

    res.json({ processed, sent });
  }),
);

/**
 * GET /api/forums/:idOrSlug/feed.atom
 * Atom feed of the forum's published topics, newest first (agent-access
 * roadmap phase 1). Always evaluated as an anonymous reader — feed readers
 * carry no session — so it exists only for forums the public can read;
 * private/deactivated forums 404. Topic bodies ship as sanitized HTML from
 * the shared markdown pipeline.
 */
restRouter.get(
  "/forums/:idOrSlug/feed.atom",
  h(async (req, res) => {
    const readable = await getReadableTimetable(
      null,
      req.params.idOrSlug as string,
    );
    if (!readable) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const { timetable } = readable;

    const topics = await buildFeed(timetable.id, null, { sort: "recent" });
    const entries = topics.slice(0, 50).map((t) => ({
      id: `urn:uuid:${t.id}`,
      title: t.title,
      url: t.slug
        ? `${linkBase}/f/${timetable.slug}/${t.hostSlug ?? t.hostId}/${t.slug}`
        : `${linkBase}/f/${timetable.slug}/topics`,
      updated: t.contentUpdatedAt ?? t.publishedAt ?? t.createdAt,
      published: t.publishedAt,
      authorName: t.hostName,
      contentHtml: renderMarkdown(t.bodyMd),
    }));

    const xml = buildAtomFeed({
      title: timetable.name,
      subtitle: "Published topics",
      feedUrl: `${linkBase}/api/forums/${timetable.slug}/feed.atom`,
      siteUrl: `${linkBase}/f/${timetable.slug}/topics`,
      entries,
    });
    res.setHeader("Content-Type", "application/atom+xml; charset=utf-8");
    // Readers poll on their own schedule; five minutes keeps a popular feed
    // from hammering the hearts math on every fetch.
    res.setHeader("Cache-Control", "public, max-age=300");
    res.send(xml);
  }),
);

/**
 * GET /api/forums/:idOrSlug/calendar.ics
 * ICS feed of the timetable's slots. Public timetables need no auth; private
 * ones require ?token=<user.icsToken> from a member.
 */
restRouter.get(
  "/forums/:idOrSlug/calendar.ics",
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
    // The whole calendar feature sits behind the forum-level flag; a feed
    // for a switched-off calendar 404s (toggling back on restores it).
    if (!isCalendarEnabled(readable.timetable.settings)) {
      res.status(404).json({ error: "Calendar not enabled" });
      return;
    }

    const slots = await getSlotsForIcs(readable.timetable.id);
    const ics = buildIcs(
      readable.timetable.name,
      slots,
      officeHoursLabel(readable.timetable.settings),
    );
    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${readable.timetable.slug}.ics"`,
    );
    res.send(ics);
  }),
);

/**
 * Legacy /api/timetables/* URLs for the two GET feeds that were distributed
 * before the public surface was renamed to "forums" (2026-07-27): ICS URLs
 * live in members' calendar apps and the Atom URL in feed readers. 301s
 * preserve the query string (the ICS ?token= must survive). Never remove.
 */
for (const suffix of ["feed.atom", "calendar.ics"]) {
  restRouter.get(`/timetables/:idOrSlug/${suffix}`, (req, res) => {
    const qs = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
    res.redirect(
      301,
      `/api/forums/${encodeURIComponent(req.params.idOrSlug as string)}/${suffix}${qs}`,
    );
  });
}

restRouter.use(
  (err: unknown, req: Request, res: Response, _next: NextFunction) => {
    logRequestError(req, err, { component: "rest" });
    res
      .status(500)
      .json({ error: "Internal server error", requestId: getRequestId(req) });
  },
);
