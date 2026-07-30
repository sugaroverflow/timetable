import type {
  DigestActivity,
  DigestPerson,
  DigestTopicCard,
  ForumDigest,
} from "@timetable/core";

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
// One font family across every email (QA 2026-07-30 — "too many fonts").
const SANS = "-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/** Wrap a body in the branded frame: wordmark, content, footer. `footer`
 * is already-escaped HTML. The wordmark carries the FORUM name in its
 * accent colour. By default the body sits in one white card; pass
 * `uncarded` when the body supplies its own cards (the digest's per-topic
 * cards). */
export function emailShell(
  body: string,
  footer: string,
  opts: { title?: string; accent?: string | null; uncarded?: boolean } = {},
): string {
  const title = opts.title ?? "Topic";
  const accent = opts.accent ?? E.ink;
  const content = opts.uncarded
    ? `<tr><td style="font-family:${SANS};font-size:15px;line-height:1.55;color:${E.ink};">${body}</td></tr>`
    : `<tr><td style="background:${E.card};border:1px solid ${E.line};border-radius:12px;padding:26px 28px;font-family:${SANS};font-size:15px;line-height:1.55;color:${E.ink};">${body}</td></tr>`;
  return [
    `<!doctype html><html><body style="margin:0;padding:0;background:${E.bg};">`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${E.bg};"><tr><td align="center" style="padding:28px 12px;">`,
    `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;">`,
    `<tr><td style="padding:0 6px 12px;font-family:${SANS};font-size:20px;font-weight:700;color:${accent};">${esc(title)}</td></tr>`,
    content,
    `<tr><td style="padding:14px 6px;font-family:${SANS};font-size:12px;line-height:1.5;color:${E.muted};">${footer}</td></tr>`,
    `</table></td></tr></table></body></html>`,
  ].join("");
}

const INDENT = 16; // px per thread level

/** A comment/reply title link, or plain bold text without a path. */
function accentLink(
  label: string,
  path: string | null,
  accent: string,
): string {
  return path
    ? `<a href="${esc(`${linkBase}${path}`)}" style="color:${accent};font-weight:600;text-decoration:none;">${esc(label)}</a>`
    : `<strong>${esc(label)}</strong>`;
}

/** A member's name linked to their per-forum profile (the person page
 * redirects id → slug, so the userId is a valid link target). */
function personLink(
  forumSlug: string,
  person: DigestPerson,
  accent: string,
): string {
  const name = esc(person.name ?? "Someone");
  if (!person.userId) return `<strong>${name}</strong>`;
  const href = `${linkBase}/f/${esc(forumSlug)}/${esc(person.userId)}`;
  return `<a href="${href}" style="color:${accent};font-weight:600;text-decoration:none;">${name}</a>`;
}

/** One line in a thread: "Name: body", indented to its depth. The new
 * comment's body wears the accent colour so it stands out; ancestor context
 * is muted. */
function threadLine(
  depth: number,
  nameHtml: string,
  body: string,
  isNew: boolean,
  accent: string,
): string {
  const color = isNew ? accent : E.muted;
  return `<div style="padding-left:${depth * INDENT}px;margin:3px 0;white-space:pre-wrap;">${nameHtml}<span style="color:${E.muted};">: </span><span style="color:${color};">${esc(body)}</span></div>`;
}

/** The Reply → leaf beneath a comment, at the next indent level. */
function replyLeaf(
  depth: number,
  path: string | null,
  commentId: string,
  accent: string,
): string {
  if (!path) return "";
  const href = `${linkBase}${path}?reply=${encodeURIComponent(commentId)}#comment-${encodeURIComponent(commentId)}`;
  return `<div style="padding-left:${depth * INDENT}px;margin:2px 0 0;"><a href="${esc(href)}" style="color:${accent};font-weight:600;text-decoration:none;">Reply →</a></div>`;
}

/** A comment/reply rendered as an indented thread: ancestors (muted) →
 * the new comment (accent body) → the Reply link leaf. */
function renderThread(
  card: DigestTopicCard,
  a: Extract<DigestActivity, { kind: "comment" | "reply" }>,
  forumSlug: string,
  accent: string,
): string {
  const lines = a.ancestors.map((anc, i) =>
    threadLine(
      i,
      personLink(forumSlug, anc.author, accent),
      anc.body,
      false,
      accent,
    ),
  );
  const depth = a.ancestors.length;
  lines.push(
    threadLine(
      depth,
      personLink(forumSlug, a.author, accent),
      a.body,
      true,
      accent,
    ),
  );
  lines.push(replyLeaf(depth + 1, card.path, a.replyToCommentId, accent));
  return lines.join("");
}

/** Every hearter on their own line with a ❤️, linked to their profile. */
function renderHearts(
  hearters: DigestPerson[],
  forumSlug: string,
  accent: string,
): string {
  return hearters
    .map(
      (h) =>
        `<div style="margin:3px 0;">❤️ ${personLink(forumSlug, h, accent)}</div>`,
    )
    .join("");
}

const note = (text: string): string =>
  `<div style="color:${E.muted};margin:3px 0;">${esc(text)}</div>`;

function renderActivity(
  card: DigestTopicCard,
  a: DigestActivity,
  forumSlug: string,
  accent: string,
): string {
  switch (a.kind) {
    case "comment":
    case "reply":
      return renderThread(card, a, forumSlug, accent);
    case "heart":
      return renderHearts(a.hearters, forumSlug, accent);
    case "new":
      return note("Newly published — take a look.");
    case "assignment":
      return note("This topic was assigned to you.");
    case "draft":
      return note("Still an unpublished draft.");
  }
}

/** One topic on its own card: "Author: Title" then its activities. */
function renderCard(
  card: DigestTopicCard,
  forumSlug: string,
  accent: string,
): string {
  const header = `<div style="font-size:16px;margin:0 0 8px;">${personLink(forumSlug, card.author, accent)}<span style="color:${E.muted};">: </span>${accentLink(card.title, card.path, accent)}</div>`;
  const activities = card.activities
    .map(
      (a) =>
        `<div style="margin:8px 0 0;">${renderActivity(card, a, forumSlug, accent)}</div>`,
    )
    .join("");
  return `<div style="background:${E.card};border:1px solid ${E.line};border-radius:12px;padding:16px 18px;margin:0 0 12px;">${header}${activities}</div>`;
}

/** "3 comments, 2 replies …" — the subject's tail, counted across cards. */
function digestSummary(digest: ForumDigest): string {
  const counts = { comment: 0, reply: 0, heart: 0, new: 0, assignment: 0 };
  for (const card of digest.topics) {
    for (const a of card.activities) {
      if (a.kind in counts) counts[a.kind as keyof typeof counts] += 1;
    }
  }
  const bits: string[] = [];
  const n = (count: number, one: string, many: string) =>
    count > 0 && bits.push(`${count} ${count === 1 ? one : many}`);
  n(counts.comment, "comment on your topics", "comments on your topics");
  n(counts.reply, "reply", "replies");
  n(counts.heart, "topic with new ❤️", "topics with new ❤️");
  n(counts.new, "new topic", "new topics");
  n(counts.assignment, "topic assigned to you", "topics assigned to you");
  return bits.join(", ");
}

/** Digest v3 (2026-07-30): per-forum, forum-branded — one card per topic,
 * ordered your-content first. The wordmark is "{Forum} Topics", the subject
 * "{Forum} Topics Digest", links wear the forum's accent, the footer points
 * at that forum's Notifications page. */
export function renderDigest(digest: ForumDigest): {
  subject: string;
  html: string;
} {
  const accent = digest.accent ?? E.primary;
  const summary = digestSummary(digest);
  const body = digest.topics
    .map((card) => renderCard(card, digest.forumSlug, accent))
    .join("\n");
  const footer = `You're getting this because you switched on email digests. Adjust them any time on ${accentLink(`your ${digest.forumName} Notifications page`, `/f/${digest.forumSlug}/notifications`, accent)}.`;
  const base = `${digest.forumName} Topics Digest`;
  return {
    subject: summary ? `${base} — ${summary}` : base,
    html: emailShell(body, footer, {
      title: `${digest.forumName} Topics`,
      accent,
      uncarded: true,
    }),
  };
}

/** Example digest for the Forum Settings "Send test digest" button — the
 * real renderer over invented-but-plausible cards, one of every activity
 * type, already in display order (your content first, drafts last). */
export function sampleDigest(args: {
  email: string;
  name: string | null;
  forumId: string;
  forumName: string;
  forumSlug: string;
  accent?: string | null;
}): ForumDigest {
  const me: DigestPerson = { name: args.name ?? "You", userId: "sample-you" };
  const who = (name: string, userId: string): DigestPerson => ({
    name,
    userId,
  });
  const p = (host: string, topic: string) =>
    `/f/${args.forumSlug}/${host}/${topic}`;
  const t = (iso: string) => new Date(iso);
  return {
    userId: "sample-you",
    email: args.email,
    name: args.name,
    forumId: args.forumId,
    forumName: args.forumName,
    forumSlug: args.forumSlug,
    accent: args.accent ?? null,
    topics: [
      // Someone replied to your comment — the whole thread above it, and a
      // one-click Reply.
      {
        topicId: "sample-garden",
        title: "A community garden for the north courtyard",
        author: who("Priya Okafor", "sample-priya"),
        path: p("priya", "community-garden"),
        activities: [
          {
            kind: "reply",
            author: who("Robin Vale", "sample-robin"),
            body: "Count me in — I can bring tools on the first weekend.",
            ancestors: [
              {
                author: who("Jordan Lee", "sample-jordan"),
                body: "Should we use raised beds or dig straight into the ground?",
              },
              {
                author: me,
                body: "Raised beds near the wall — the soil there is thin.",
              },
            ],
            replyToCommentId: "sample-reply-1",
            at: t("2026-07-30T09:12:00Z"),
          },
        ],
      },
      // Your own topic: a new comment (with Reply) and a wave of ❤️s, every
      // hearter named.
      {
        topicId: "sample-mine",
        title: "Rethinking the weekly assembly format",
        author: me,
        path: p("you", "weekly-assembly"),
        activities: [
          {
            kind: "comment",
            author: who("Sam Whitfield", "sample-sam"),
            body: "This is exactly what we've needed — could we pair it with the newcomers session?",
            ancestors: [],
            replyToCommentId: "sample-comment-1",
            at: t("2026-07-30T08:40:00Z"),
          },
          {
            kind: "heart",
            hearters: [
              who("Amara Okafor", "sample-amara"),
              who("Tariq Hassan", "sample-tariq"),
              who("Rosa Delgado", "sample-rosa"),
              who("Ben Fletcher", "sample-ben"),
              who("Maya Iyer", "sample-maya"),
              who("Kwame Mensah", "sample-kwame"),
            ],
            at: t("2026-07-30T07:55:00Z"),
          },
        ],
      },
      // An admin handed you a topic to run.
      {
        topicId: "sample-assigned",
        title: "Welcome newcomers session",
        author: me,
        path: p("you", "welcome-newcomers"),
        activities: [{ kind: "assignment", at: t("2026-07-29T18:20:00Z") }],
      },
      // A freshly published topic to read and vote on.
      {
        topicId: "sample-new",
        title: "Open data standards for local councils",
        author: who("Hana Kim", "sample-hana"),
        path: p("hana", "open-data-standards"),
        activities: [{ kind: "new", at: t("2026-07-29T16:00:00Z") }],
      },
      // Your standing reminder — a draft you haven't published.
      {
        topicId: "sample-draft",
        title: "Half-finished idea about peer mentoring",
        author: me,
        path: p("you", "peer-mentoring"),
        activities: [{ kind: "draft", at: t("2026-07-20T10:00:00Z") }],
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
