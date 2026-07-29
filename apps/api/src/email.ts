import type { ForumDigest } from "@timetable/core";

const EMAIL_FROM = process.env.EMAIL_FROM ?? "Topic <no-reply@example.com>";

/**
 * Send an email via Resend. With no RESEND_API_KEY (local dev), the message is
 * logged to the console instead.
 */
export async function sendEmail(args: {
  to: string;
  subject: string;
  html: string;
}): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.log(
      `\n[email] to=${args.to}\n[email] subject=${args.subject}\n${args.html}\n`,
    );
    return;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: EMAIL_FROM,
      to: args.to,
      subject: args.subject,
      html: args.html,
    }),
  });
  if (!res.ok) {
    throw new Error(`Resend error ${res.status}: ${await res.text()}`);
  }
}

const esc = (s: string) =>
  s.replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c,
  );

/** Digest/feed links use the first configured web origin as their base. */
export const linkBase = (process.env.WEB_ORIGIN ?? "http://localhost:3000")
  .split(",")[0]!
  .trim()
  .replace(/\/$/, "");

const linked = (label: string, path: string | null): string =>
  path
    ? `<a href="${esc(`${linkBase}${path}`)}">${esc(label)}</a>`
    : esc(label);

// ---------------------------------------------------------------------------
// Email shell (2026-07-29): one branded wrapper for every outbound email.
// Email clients ignore stylesheets, so styles are inline and colours are
// hardcoded hexes mirroring tokens.css's LIGHT palette (emails don't do
// dark mode reliably; a light card is the safe universal).
// ---------------------------------------------------------------------------

const E = {
  bg: "#eceef3", // --bg
  card: "#ffffff", // --card
  ink: "#1b2330", // --ink
  muted: "#5c6675", // --muted (approx)
  line: "#e3e6ec", // --line (approx)
  primary: "#2f54eb", // --primary
};
const SANS = "-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const SERIF = "Georgia,'Times New Roman',serif";

/** Wrap a body in the branded frame: wordmark, white card, footer.
 * `footer` is already-escaped HTML (it usually carries a link). Digest v2
 * (2026-07-29): the wordmark defaults to the app but is the FORUM name for
 * forum-scoped mail, with the forum's accent as the wordmark colour. */
export function emailShell(
  body: string,
  footer: string,
  opts: { title?: string; accent?: string | null } = {},
): string {
  const title = opts.title ?? "Topic";
  const accent = opts.accent ?? E.ink;
  return [
    `<!doctype html><html><body style="margin:0;padding:0;background:${E.bg};">`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${E.bg};"><tr><td align="center" style="padding:28px 12px;">`,
    `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;">`,
    `<tr><td style="padding:0 6px 10px;font-family:${SERIF};font-size:20px;font-weight:bold;color:${accent};">${esc(title)}</td></tr>`,
    `<tr><td style="background:${E.card};border:1px solid ${E.line};border-radius:12px;padding:26px 28px;font-family:${SANS};font-size:15px;line-height:1.55;color:${E.ink};">`,
    body,
    `</td></tr>`,
    `<tr><td style="padding:14px 6px;font-family:${SANS};font-size:12px;line-height:1.5;color:${E.muted};">${footer}</td></tr>`,
    `</table></td></tr></table></body></html>`,
  ].join("");
}

const sectionTitle = (label: string): string =>
  `<h2 style="font-family:${SERIF};font-size:17px;font-weight:600;margin:20px 0 8px;color:${E.ink};">${esc(label)}</h2>`;

const item = (html: string): string => `<p style="margin:0 0 7px;">${html}</p>`;

const dim = (text: string): string =>
  `<span style="color:${E.muted};">${esc(text)}</span>`;

/** Full-text quote block for comments/replies (digest v2: Ed wants the
 * whole comment readable from the inbox). */
const quoted = (body: string): string =>
  `<blockquote style="margin:4px 0 0;padding:6px 12px;border-left:3px solid ${E.line};color:${E.ink};white-space:pre-wrap;">${esc(body)}</blockquote>`;

type Linker = (label: string, path: string | null) => string;

/** One "<Author> on <topic>" + full-text quote section (comments/replies). */
function quotedSection(
  title: string,
  rows: {
    topicTitle: string;
    by: string | null;
    body: string;
    path: string | null;
  }[],
  link: Linker,
): string[] {
  if (rows.length === 0) return [];
  return [
    sectionTitle(title),
    ...rows.map((r) =>
      item(
        `<strong>${esc(r.by ?? "Someone")}</strong> on ${link(r.topicTitle, r.path)}${quoted(r.body)}`,
      ),
    ),
  ];
}

function listSection(title: string, items: string[]): string[] {
  return items.length === 0 ? [] : [sectionTitle(title), ...items];
}

function digestSections(digest: ForumDigest, link: Linker): string[] {
  return [
    // Comments on the recipient's topics lead, full text (Ed, 2026-07-29).
    ...quotedSection("Comments on your topics", digest.comments, link),
    ...quotedSection("Replies to your comments", digest.replies, link),
    ...listSection(
      "New topics",
      digest.newTopics.map((t) => item(link(t.title, t.path))),
    ),
    ...listSection(
      "❤️ on your topics",
      digest.heartActivity.map((a) =>
        item(`${link(a.topicTitle, a.path)} ${dim(`+${a.count} ❤️`)}`),
      ),
    ),
    ...listSection(
      "You have a topic",
      digest.assignedTopics.map((a) =>
        item(`${link(a.topicTitle, a.path)} ${dim("was assigned to you")}`),
      ),
    ),
    // Standing reminder, never the sole content (isForumDigestEmpty
    // ignores drafts, so this only renders alongside real news).
    ...listSection(
      "Your unpublished drafts",
      digest.drafts.map((d) => item(link(d.title, d.path))),
    ),
  ];
}

/** "3 comments, 2 replies" — the subject's tail. */
function digestSummary(digest: ForumDigest): string {
  const bits: string[] = [];
  const n = (count: number, one: string, many: string) =>
    count > 0 && bits.push(`${count} ${count === 1 ? one : many}`);
  n(
    digest.comments.length,
    "comment on your topics",
    "comments on your topics",
  );
  n(digest.replies.length, "reply", "replies");
  n(digest.newTopics.length, "new topic", "new topics");
  n(digest.heartActivity.length, "❤️ update", "❤️ updates");
  n(
    digest.assignedTopics.length,
    "topic assigned to you",
    "topics assigned to you",
  );
  return bits.join(", ");
}

/** Digest v2 (2026-07-29): per-forum, forum-branded — the wordmark and
 * subject carry the FORUM's name, links wear its accent colour, and the
 * footer points at that forum's Notifications page. */
export function renderDigest(digest: ForumDigest): {
  subject: string;
  html: string;
} {
  const accent = digest.accent ?? E.primary;
  const link = (label: string, path: string | null): string =>
    path
      ? `<a href="${esc(`${linkBase}${path}`)}" style="color:${accent};">${esc(label)}</a>`
      : esc(label);
  const summary = digestSummary(digest);
  const greeting = digest.name ? `Hi ${esc(digest.name)},` : "Hi,";
  const body = [
    `<p style="margin:0;">${greeting}</p>`,
    ...digestSections(digest, link),
  ].join("\n");
  const footer = `You're getting this because you switched on email digests. Adjust them any time on ${link(`your ${digest.forumName} Notifications page`, `/f/${digest.forumSlug}/notifications`)}.`;
  return {
    subject: summary
      ? `[${digest.forumName}] Digest — ${summary}`
      : `[${digest.forumName}] Digest`,
    html: emailShell(body, footer, { title: digest.forumName, accent }),
  };
}

/** Example digest for the Forum Settings "Send test digest" button
 * (2026-07-29): the real renderer over invented-but-plausible items, so
 * admins can see exactly what members will receive. Topic links land on
 * the forum's All Topics page. */
export function sampleDigest(args: {
  email: string;
  name: string | null;
  forumId: string;
  forumName: string;
  forumSlug: string;
  accent?: string | null;
}): ForumDigest {
  const path = `/f/${args.forumSlug}/topics`;
  return {
    userId: "sample",
    email: args.email,
    name: args.name,
    forumId: args.forumId,
    forumName: args.forumName,
    forumSlug: args.forumSlug,
    accent: args.accent ?? null,
    comments: [
      {
        topicTitle: "Your example topic",
        by: "Sam Example",
        body: "This is exactly the kind of thing we should be doing more of. I especially like the second half — could we pair it with the newcomers session?",
        path,
      },
    ],
    replies: [
      {
        topicTitle: "A community garden for the north courtyard",
        by: "Robin Example",
        body: "Count me in — I can bring tools on the first weekend.",
        path,
      },
    ],
    newTopics: [
      { title: "A community garden for the north courtyard", path },
      { title: "Rethinking the weekly assembly format", path },
    ],
    heartActivity: [{ topicTitle: "Your example topic", count: 3, path }],
    drafts: [{ title: "Half-finished idea about mentoring", path }],
    assignedTopics: [{ topicTitle: "Welcome newcomers session", path }],
  };
}

/** Sysadmin notification when any new forum is created (opt-in via the
 * /admin dashboard). */
export function renderNewForum(args: {
  forumName: string;
  forumSlug: string;
  ownerName: string | null;
  ownerEmail: string | null;
}): { subject: string; html: string } {
  const owner = [args.ownerName, args.ownerEmail && `<${args.ownerEmail}>`]
    .filter(Boolean)
    .join(" ");
  return {
    subject: `New forum created: ${args.forumName}`,
    html: emailShell(
      [
        `<p style="margin:0 0 10px;"><strong>New forum on Topic</strong></p>`,
        `<p style="margin:0 0 10px;">${linked(args.forumName, `/f/${args.forumSlug}/topics`)}</p>`,
        `<p style="margin:0;">Owner: ${owner ? esc(owner) : "unknown"}</p>`,
      ].join("\n"),
      "Sysadmin notification — switch it off on your /admin dashboard.",
    ),
  };
}

/**
 * Invite email for a pre-created account (product feedback round 2). Sent
 * explicitly by an admin after the person's profile/topics are populated —
 * never automatically on account creation.
 */
export function renderInvite(args: {
  timetableName: string;
  timetableSlug: string;
  inviteeName: string | null;
  inviterName: string | null;
  topicsCount: number;
  /** Clerk sign-in ticket: the link signs the member in with one click —
   * the invite email itself proves address ownership, so no OTP round-trip
   * (QA 2026-07-28). Null falls back to the plain sign-in link. */
  signInTicket: string | null;
}): { subject: string; html: string } {
  const subject = `You've been added to ${args.timetableName}`;
  const greeting = args.inviteeName ? `Hi ${esc(args.inviteeName)},` : "Hi,";
  const by = args.inviterName ? ` by ${esc(args.inviterName)}` : "";
  const topics =
    args.topicsCount > 0
      ? `<p>You already have ${args.topicsCount} topic${
          args.topicsCount === 1 ? "" : "s"
        } waiting under your name.</p>`
      : "";
  const destination = encodeURIComponent(`/f/${args.timetableSlug}/topics`);
  // Straight to the sign-in page either way (invitees have no session yet —
  // landing on the forum showed them a guest view; prod QA 2026-07-27),
  // with the forum as the post-sign-in destination. Clerk's <SignIn/>
  // consumes the __clerk_ticket param and signs in without the OTP.
  const cta = args.signInTicket
    ? `<p>${linked("Open your forum", `/sign-in?__clerk_ticket=${encodeURIComponent(args.signInTicket)}&redirect_url=${destination}`)} — one click and you're signed in; no password or code needed.</p>`
    : `<p>${linked("Sign in with this email address to get started", `/sign-in?redirect_url=${destination}`)} — no password needed, you'll receive a one-time code.</p>`;
  const body = [
    `<p style="margin:0 0 10px;">${greeting}</p>`,
    `<p style="margin:0 0 10px;">You've been added to <strong>${esc(args.timetableName)}</strong>${by}.</p>`,
    topics,
    cta,
  ].join("\n");
  const html = emailShell(
    body,
    `Sent because an organiser of ${esc(args.timetableName)} invited this address on ${linked("topic.forum", "/")}.`,
  );
  return { subject, html };
}
