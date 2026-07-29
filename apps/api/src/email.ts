import type { UserDigest } from "@timetable/core";

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

/** Wrap a body in the branded frame: Topic wordmark, white card, footer.
 * `footer` is already-escaped HTML (it usually carries a link). */
export function emailShell(body: string, footer: string): string {
  return [
    `<!doctype html><html><body style="margin:0;padding:0;background:${E.bg};">`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${E.bg};"><tr><td align="center" style="padding:28px 12px;">`,
    `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;">`,
    `<tr><td style="padding:0 6px 10px;font-family:${SERIF};font-size:20px;font-weight:bold;color:${E.ink};">Topic</td></tr>`,
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

function digestSections(digest: UserDigest): string[] {
  const parts: string[] = [];
  if (digest.newTopics.length > 0) {
    parts.push(sectionTitle("New topics"));
    for (const t of digest.newTopics) {
      parts.push(item(`${linked(t.title, t.path)} ${dim(t.timetableName)}`));
    }
  }
  if (digest.replies.length > 0) {
    parts.push(sectionTitle("Replies to your comments"));
    for (const r of digest.replies) {
      parts.push(
        item(
          `<strong>${esc(r.by ?? "Someone")}</strong> on ${esc(r.topicTitle)}<br/>${dim(`“${r.snippet}”`)}`,
        ),
      );
    }
  }
  if (digest.hostActivity.length > 0) {
    parts.push(sectionTitle("Activity on your topics"));
    for (const a of digest.hostActivity) {
      const label = a.kind === "heart" ? "❤️" : "💬";
      parts.push(
        item(`${linked(a.topicTitle, a.path)} ${dim(`+${a.count} ${label}`)}`),
      );
    }
  }
  if (digest.assignedTopics.length > 0) {
    parts.push(sectionTitle("You have a topic"));
    for (const a of digest.assignedTopics) {
      parts.push(
        item(
          `${linked(a.topicTitle, a.path)} ${dim(`was assigned to you in ${a.timetableName}`)}`,
        ),
      );
    }
  }
  return parts;
}

/** "3 new topics, 2 replies" — the subject's tail and the intro line. */
function digestSummary(digest: UserDigest): string {
  const bits: string[] = [];
  const n = (count: number, one: string, many: string) =>
    count > 0 && bits.push(`${count} ${count === 1 ? one : many}`);
  n(digest.newTopics.length, "new topic", "new topics");
  n(digest.replies.length, "reply", "replies");
  n(
    digest.hostActivity.length,
    "update on your topics",
    "updates on your topics",
  );
  n(
    digest.assignedTopics.length,
    "topic assigned to you",
    "topics assigned to you",
  );
  return bits.join(", ");
}

export function renderDigest(digest: UserDigest): {
  subject: string;
  html: string;
} {
  const summary = digestSummary(digest);
  const greeting = digest.name ? `Hi ${esc(digest.name)},` : "Hi,";
  const body = [
    `<p style="margin:0 0 4px;">${greeting}</p>`,
    `<p style="margin:0;">${esc(summary ? `Since your last digest: ${summary}.` : "Here's what's new in your forums.")}</p>`,
    ...digestSections(digest),
  ].join("\n");
  const footer = `You're getting this because you switched on email digests. Adjust them any time on your Notifications page at ${linked("topic.forum", "/")}.`;
  return {
    subject: summary ? `Your Topic digest — ${summary}` : "Your Topic digest",
    html: emailShell(body, footer),
  };
}

/** Example digest for the Forum Settings "Send test digest" button
 * (2026-07-29): the real renderer over invented-but-plausible items, so
 * admins can see exactly what members will receive. Topic links land on
 * the forum's All Topics page. */
export function sampleDigest(args: {
  email: string;
  name: string | null;
  forumName: string;
  forumSlug: string;
}): UserDigest {
  const path = `/f/${args.forumSlug}/topics`;
  return {
    userId: "sample",
    email: args.email,
    name: args.name,
    newTopics: [
      {
        title: "A community garden for the north courtyard",
        timetableName: args.forumName,
        path,
      },
      {
        title: "Rethinking the weekly assembly format",
        timetableName: args.forumName,
        path,
      },
    ],
    replies: [
      {
        topicTitle: "A community garden for the north courtyard",
        by: "Sam Example",
        snippet: "Count me in — I can bring tools on the first weekend.",
      },
    ],
    hostActivity: [
      { topicTitle: "Your example topic", kind: "heart", count: 3, path },
      { topicTitle: "Your example topic", kind: "comment", count: 2, path },
    ],
    assignedTopics: [
      {
        topicTitle: "Welcome newcomers session",
        timetableName: args.forumName,
        path,
      },
    ],
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
