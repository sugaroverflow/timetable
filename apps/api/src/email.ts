import type {
  DigestActivity,
  DigestComment,
  DigestPerson,
  DigestSessionLine,
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

// Dark-mode overrides (QA 2026-07-30). Inline styles carry the light look;
// a <style> block flips a handful of classes for clients that honour
// prefers-color-scheme (Apple Mail, iOS Mail, others). The accent, pills
// and avatars stay legible on both grounds, so only surfaces/ink/rules
// flip. Values mirror tokens.css's dark palette.
const DARK = {
  bg: "#14171e",
  card: "#1d222c",
  ink: "#e7eaf1",
  muted: "#9aa4b2",
  line: "#2b3240",
};
const DARK_STYLE =
  `@media (prefers-color-scheme:dark){` +
  `.em-bg{background:${DARK.bg}!important}` +
  `.em-card{background:${DARK.card}!important;border-color:${DARK.line}!important}` +
  `.em-ink{color:${DARK.ink}!important}` +
  `.em-muted{color:${DARK.muted}!important}` +
  `.em-rule{border-color:${DARK.line}!important}` +
  `}`;

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
    ? `<tr><td class="em-ink" style="font-family:${SANS};font-size:15px;line-height:1.55;color:${E.ink};">${body}</td></tr>`
    : `<tr><td class="em-card em-ink" style="background:${E.card};border:1px solid ${E.line};border-radius:12px;padding:26px 28px;font-family:${SANS};font-size:15px;line-height:1.55;color:${E.ink};">${body}</td></tr>`;
  return [
    `<!doctype html><html><head>`,
    `<meta name="color-scheme" content="light dark">`,
    `<meta name="supported-color-schemes" content="light dark">`,
    `<style>${DARK_STYLE}</style></head>`,
    `<body class="em-bg" style="margin:0;padding:0;background:${E.bg};">`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="em-bg" style="background:${E.bg};"><tr><td align="center" style="padding:28px 12px;">`,
    `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;">`,
    `<tr><td style="padding:0 6px 12px;font-family:${SANS};font-size:20px;font-weight:700;color:${accent};">${esc(title)}</td></tr>`,
    content,
    `<tr><td class="em-muted" style="padding:14px 6px;font-family:${SANS};font-size:12px;line-height:1.5;color:${E.muted};">${footer}</td></tr>`,
    `</table></td></tr></table></body></html>`,
  ].join("");
}

const INDENT = 16; // px per thread level

// Initials-avatar palette + hash — mirrors apps/web Avatar.tsx and the
// --avatar-1…8 tokens, so an author's email avatar colour matches the app.
const AVATAR_PALETTE = [
  "#7048e8",
  "#e8590c",
  "#1098ad",
  "#2f9e44",
  "#c2255c",
  "#3b5bdb",
  "#0c8599",
  "#5f3dc4",
];
function avatarColour(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length]!;
}
function initials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/** The author's avatar: their photo, or a colour-hashed initials circle
 * matching the app. (Rounds in most clients; a few — notably Outlook —
 * ignore border-radius and show it square.) */
function avatarCell(person: DigestPerson, size: number): string {
  if (person.image) {
    return `<img src="${esc(person.image)}" width="${size}" height="${size}" alt="" style="width:${size}px;height:${size}px;border-radius:${size / 2}px;object-fit:cover;display:block;">`;
  }
  const label = person.name ?? "?";
  return `<div style="width:${size}px;height:${size}px;border-radius:${size / 2}px;background:${avatarColour(label)};color:#ffffff;font-weight:700;font-size:15px;text-align:center;line-height:${size}px;">${esc(initials(label))}</div>`;
}

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

/** A member's name as plain, unlinked bold text — used for commenters and
 * hearters, whose names appear inline in activity and don't need to link. */
function personName(person: DigestPerson): string {
  return `<strong>${esc(person.name ?? "Someone")}</strong>`;
}

type ThreadNode = { comment: DigestComment; isNew: boolean };

/** One line in a thread: "Name: body", indented to its depth. A new comment
 * wears the accent colour and gets a Reply link; ancestors are muted. */
function threadLine(
  node: ThreadNode,
  depth: number,
  path: string | null,
  accent: string,
): string {
  const name = personName(node.comment.author);
  const color = node.isNew ? accent : E.muted;
  const bodyCls = node.isNew ? "" : ' class="em-muted"';
  const line = `<div style="padding-left:${depth * INDENT}px;margin:3px 0;white-space:pre-wrap;">${name}<span class="em-muted" style="color:${E.muted};">: </span><span${bodyCls} style="color:${color};">${esc(node.comment.body)}</span></div>`;
  if (!node.isNew || !path) return line;
  const id = node.comment.id;
  const href = `${linkBase}${path}?reply=${encodeURIComponent(id)}#comment-${encodeURIComponent(id)}`;
  const reply = `<div style="padding-left:${(depth + 1) * INDENT}px;margin:2px 0 0;"><a href="${esc(href)}" style="color:${accent};font-weight:600;text-decoration:none;">Reply →</a></div>`;
  return line + reply;
}

/** Merge a card's comment/reply activities into ONE thread tree — shared
 * ancestors collapse to a single node — then render it depth-first, so
 * several replies to the same comment sit together under it. */
function renderThreadTree(
  card: DigestTopicCard,
  acts: Extract<DigestActivity, { kind: "comment" | "reply" }>[],
  accent: string,
): string {
  const nodes = new Map<string, ThreadNode>();
  for (const a of acts) {
    for (const anc of a.ancestors) {
      if (!nodes.has(anc.id)) nodes.set(anc.id, { comment: anc, isNew: false });
    }
    nodes.set(a.comment.id, { comment: a.comment, isNew: true });
  }

  const children = new Map<string, string[]>();
  const roots: string[] = [];
  for (const [id, { comment }] of nodes) {
    const parent =
      comment.parentId && nodes.has(comment.parentId) ? comment.parentId : null;
    if (parent) children.set(parent, [...(children.get(parent) ?? []), id]);
    else roots.push(id);
  }

  const lines: string[] = [];
  const walk = (id: string, depth: number): void => {
    const node = nodes.get(id);
    if (!node) return;
    lines.push(threadLine(node, depth, card.path, accent));
    for (const child of children.get(id) ?? []) walk(child, depth + 1);
  };
  for (const root of roots) walk(root, 0);
  return lines.join("");
}

/** Every hearter on their own line with a ❤️. */
function renderHearts(hearters: DigestPerson[]): string {
  return hearters
    .map((h) => `<div style="margin:3px 0;">❤️ ${personName(h)}</div>`)
    .join("");
}

const STATUS_PILLS: Record<
  "new" | "assignment" | "draft",
  [string, string, string]
> = {
  // [label, background, text]
  new: ["New", "#e8f6ec", "#207a32"],
  assignment: ["Assigned to you", "#eaeefe", "#2f54eb"],
  draft: ["Unpublished draft", "#eef0f5", "#7d8694"],
};

function statusPill(kind: "new" | "assignment" | "draft"): string {
  const [label, bg, fg] = STATUS_PILLS[kind];
  return `<span style="display:inline-block;background:${bg};color:${fg};font-size:11px;font-weight:600;padding:2px 8px;border-radius:999px;margin-left:6px;white-space:nowrap;vertical-align:middle;">${label}</span>`;
}

/** Markdown → plain text for the body excerpt (strip the syntax the app's
 * editor stores; email shows text, not rendered markdown). */
function stripMarkdown(md: string): string {
  return md
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_`#>~]/g, "")
    .replace(/\r/g, "")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

/** The topic body, truncated near where the app shows "Show more". */
function bodyExcerpt(
  body: string,
  path: string | null,
  accent: string,
): string {
  const text = stripMarkdown(body);
  if (!text) return "";
  const LIMIT = 280;
  let shown = text;
  let truncated = false;
  if (text.length > LIMIT) {
    shown = text.slice(0, LIMIT);
    const space = shown.lastIndexOf(" ");
    if (space > 200) shown = shown.slice(0, space);
    truncated = true;
  }
  const more =
    truncated && path
      ? `… <a href="${esc(`${linkBase}${path}`)}" style="color:${accent};font-weight:600;text-decoration:none;">Show more →</a>`
      : truncated
        ? "…"
        : "";
  return `<div class="em-ink" style="white-space:pre-wrap;color:${E.ink};">${esc(shown)}${more}</div>`;
}

const divider = `<div class="em-rule" style="border-top:1px solid ${E.line};margin:12px 0;"></div>`;

/** Naive plural for role labels (mirrors the web pluralLabel). */
function pluralize(label: string): string {
  return /[sxy]$/i.test(label) ? label : `${label}s`;
}

/** A small muted heading above a non-public comment thread. Public threads
 * get none (regular comments need no label). */
function threadLabel(
  visibility: "public" | "host_only" | "admin_only",
  hostLabel: string,
  adminLabel: string,
): string {
  const text =
    visibility === "host_only"
      ? `${pluralize(hostLabel)} only`
      : visibility === "admin_only"
        ? `You and ${pluralize(adminLabel)}`
        : "";
  if (!text) return "";
  return `<div class="em-muted" style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;color:${E.muted};margin:0 0 4px;">${esc(text)}</div>`;
}

type Discussion = Extract<DigestActivity, { kind: "comment" | "reply" }>;

/** Discussion split into its three threads (regular / host-only /
 * you-and-admin), each rendered as one merged tree under its label. */
function renderDiscussion(
  card: DigestTopicCard,
  discussion: Discussion[],
  accent: string,
  hostLabel: string,
  adminLabel: string,
): string[] {
  const order = ["public", "host_only", "admin_only"] as const;
  return order
    .map((vis) => {
      const acts = discussion.filter((a) => a.visibility === vis);
      if (acts.length === 0) return "";
      return (
        threadLabel(vis, hostLabel, adminLabel) +
        renderThreadTree(card, acts, accent)
      );
    })
    .filter(Boolean);
}

/** One topic on its own card: avatar + title (+ status pills) + "by Author"
 * byline, then a body excerpt (status cards), each comment thread (labeled
 * when not public), and ❤️s — with a rule between every distinct section. */
function renderCard(
  card: DigestTopicCard,
  forumSlug: string,
  accent: string,
  hostLabel: string,
  adminLabel: string,
): string {
  const statuses = card.activities.filter(
    (
      a,
    ): a is Extract<DigestActivity, { kind: "new" | "assignment" | "draft" }> =>
      a.kind === "new" || a.kind === "assignment" || a.kind === "draft",
  );
  const discussion = card.activities.filter(
    (a): a is Discussion => a.kind === "comment" || a.kind === "reply",
  );
  const heart = card.activities.find((a) => a.kind === "heart");
  // Upcoming confirmed sessions lead the card (QA 2026-08-03) — present in
  // every digest a hearter receives, "New" pill when freshly confirmed.
  const sessions = card.activities.filter(
    (a): a is Extract<DigestActivity, { kind: "session" }> =>
      a.kind === "session",
  );
  const pills = statuses.map((a) => statusPill(a.kind)).join("");

  const header =
    `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 10px;"><tr>` +
    `<td valign="top" style="padding-right:10px;">${avatarCell(card.author, 40)}</td>` +
    `<td valign="top">` +
    `<div style="font-size:17px;font-weight:700;line-height:1.3;">${accentLink(card.title, card.path, accent)}${pills}</div>` +
    `<div class="em-muted" style="color:${E.muted};font-size:13px;margin-top:2px;">by ${personLink(forumSlug, card.author, accent)}</div>` +
    `</td></tr></table>`;

  const sections: string[] = [];
  if (sessions.length > 0) {
    sections.push(
      sessions.map((a) => sessionLine(a.session, forumSlug, accent)).join(""),
    );
  }
  if (statuses.length > 0 && card.body) {
    sections.push(bodyExcerpt(card.body, card.path, accent));
  }
  // ❤️s before comments — the same order as a topic card in the app, where
  // the actions row sits above the thread (QA 2026-07-30).
  if (heart && heart.kind === "heart") {
    sections.push(renderHearts(heart.hearters));
  }
  sections.push(
    ...renderDiscussion(card, discussion, accent, hostLabel, adminLabel),
  );
  const bodyHtml = sections
    .map((s, i) => (i === 0 ? s : `${divider}${s}`))
    .join("");

  return `<div class="em-card" style="background:${E.card};border:1px solid ${E.line};border-radius:12px;padding:16px 18px;margin:0 0 12px;">${header}<div style="margin-top:8px;">${bodyHtml}</div></div>`;
}

// ---------------------------------------------------------------------------
// Calendar sections (calendar v2): "Coming up" (confirmed sessions) and
// "Can you make it?" (proposed sessions for topics the recipient ❤️'d).
// ---------------------------------------------------------------------------

/** "Tue 12 Aug, 19:00–21:00" — formatted in UTC (slots are stored UTC and
 * forums have no timezone setting yet; the app renders viewer-local). */
function sessionWhen(s: DigestSessionLine): string {
  const day = s.startsAt.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
  const time = (d: Date) =>
    d.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "UTC",
    });
  return `${day}, ${time(s.startsAt)}–${time(s.endsAt)}`;
}

const NEW_PILL = `<span style="display:inline-block;background:#e8f6ec;color:#207a32;font-size:11px;font-weight:600;padding:2px 8px;border-radius:999px;margin-left:6px;white-space:nowrap;vertical-align:middle;">New</span>`;

/** One session line: bold linked topic (its URL when published elsewhere,
 * the forum calendar otherwise), when/where, and the event URL spelled out
 * as a register link (QA 2026-08-03). */
function sessionLine(
  s: DigestSessionLine,
  forumSlug: string,
  accent: string,
): string {
  const href = s.url || `${linkBase}/f/${forumSlug}/calendar`;
  const where = s.location ? ` · ${esc(s.location)}` : "";
  const register = s.url
    ? `<div style="font-size:13px;"><a href="${esc(s.url)}" style="color:${accent};font-weight:600;text-decoration:none;">Register → ${esc(s.url.replace(/^https?:\/\//, ""))}</a></div>`
    : "";
  return (
    `<div style="margin:6px 0;">` +
    `<a href="${esc(href)}" style="color:${accent};font-weight:600;text-decoration:none;">${esc(s.topicTitle)}</a>` +
    `${s.isNew ? NEW_PILL : ""}` +
    `<div class="em-muted" style="color:${E.muted};font-size:13px;">${esc(sessionWhen(s))}${where}</div>` +
    register +
    `</div>`
  );
}

/** A calendar section as its own card, matching the topic-card frame. */
function renderSessionCard(
  heading: string,
  intro: string,
  sessions: DigestSessionLine[],
  forumSlug: string,
  accent: string,
): string {
  if (sessions.length === 0) return "";
  const lines = sessions.map((s) => sessionLine(s, forumSlug, accent)).join("");
  return (
    `<div class="em-card" style="background:${E.card};border:1px solid ${E.line};border-radius:12px;padding:16px 18px;margin:0 0 12px;">` +
    `<div style="font-size:17px;font-weight:700;line-height:1.3;">${esc(heading)}</div>` +
    (intro
      ? `<div class="em-muted" style="color:${E.muted};font-size:13px;margin-top:2px;">${esc(intro)}</div>`
      : "") +
    `<div style="margin-top:8px;">${lines}</div></div>`
  );
}

/** "3 comments, 2 replies …" — the subject's tail, counted across cards. */
function digestSummary(digest: ForumDigest): string {
  const counts = { comment: 0, reply: 0, heart: 0, new: 0, assignment: 0 };
  let confirmedNew = 0;
  for (const card of digest.topics) {
    for (const a of card.activities) {
      if (a.kind === "session") {
        if (a.session.isNew) confirmedNew += 1;
      } else if (a.kind in counts) {
        counts[a.kind as keyof typeof counts] += 1;
      }
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
  n(confirmedNew, "session confirmed", "sessions confirmed");
  const asksNew = digest.availabilityAsks.filter((s) => s.isNew).length;
  n(
    asksNew,
    "session wants your availability",
    "sessions want your availability",
  );
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
  // Confirmed sessions ride their topic's card (QA 2026-08-03); the
  // availability ask stays a section — the digest's one direct CTA.
  const body = [
    renderSessionCard(
      "Can you make it?",
      "Sessions proposed for topics you ❤️'d — share your availability.",
      digest.availabilityAsks,
      digest.forumSlug,
      accent,
    ),
    ...digest.topics.map((card) =>
      renderCard(
        card,
        digest.forumSlug,
        accent,
        digest.hostLabel,
        digest.adminLabel,
      ),
    ),
  ]
    .filter(Boolean)
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

// --- Sample-digest builders (split so no one function trips the line cap) ---

type SamplePath = (host: string, topic: string) => string;
const sWho = (name: string, userId: string): DigestPerson => ({
  name,
  userId,
  image: null,
});
const sC = (
  id: string,
  parentId: string | null,
  author: DigestPerson,
  body: string,
): DigestComment => ({ id, parentId, author, body });
const sAt = (iso: string): Date => new Date(iso);
const sReply = (
  visibility: "public" | "host_only" | "admin_only",
  comment: DigestComment,
  ancestors: DigestComment[],
  iso: string,
): DigestActivity => ({
  kind: "reply",
  visibility,
  comment,
  ancestors,
  at: sAt(iso),
});
const sComment = (
  visibility: "public" | "host_only" | "admin_only",
  comment: DigestComment,
  iso: string,
): DigestActivity => ({
  kind: "comment",
  visibility,
  comment,
  ancestors: [],
  at: sAt(iso),
});

/** Two discussion cards: a busy multi-reply thread (merged into one tree)
 * and a reply to your comment on someone else's topic. */
function sampleThreadCards(
  me: DigestPerson,
  p: SamplePath,
  forumId: string,
): DigestTopicCard[] {
  const marcus = sWho("Marcus Webb", "sample-marcus");
  const leila = sWho("Leila Haddad", "sample-leila");
  const base = [
    sC(
      "rcv-marcus",
      null,
      marcus,
      "I've sketched three options below — keen to hear which people prefer.",
    ),
    sC(
      "rcv-you",
      "rcv-marcus",
      me,
      "Option B seems fairest to the smaller working groups.",
    ),
  ];
  const leilaReply = sC(
    "rcv-leila",
    "rcv-you",
    leila,
    "Agreed — though Option B needs a quorum rule to be safe.",
  );
  return [
    {
      topicId: "sample-rcv",
      title: "Should we adopt ranked-choice for our elections?",
      author: marcus,
      body: null,
      path: p("marcus", "ranked-choice"),
      activities: [
        // A freshly confirmed session leads the card (calendar v2).
        {
          kind: "session",
          session: {
            slotId: "sample-slot-confirmed",
            startsAt: sAt("2026-08-04T18:00:00Z"),
            endsAt: sAt("2026-08-04T20:00:00Z"),
            location: "Classroom",
            url: "https://lu.ma/sample-rcv",
            topicId: "sample-rcv",
            topicTitle: "Should we adopt ranked-choice for our elections?",
            timetableId: forumId,
            updatedAt: sAt("2026-07-30T09:00:00Z"),
            isNew: true,
          },
          at: sAt("2026-07-30T09:00:00Z"),
        },
        sReply("public", leilaReply, base, "2026-07-30T10:05:00Z"),
        sReply(
          "public",
          sC(
            "rcv-daniel",
            "rcv-you",
            sWho("Daniel Osei", "sample-daniel"),
            "B also handles ties better than A did last year.",
          ),
          base,
          "2026-07-30T10:22:00Z",
        ),
        sReply(
          "public",
          sC(
            "rcv-sofia",
            "rcv-leila",
            sWho("Sofia Russo", "sample-sofia"),
            "A two-thirds quorum? That worked well for us last spring.",
          ),
          [...base, leilaReply],
          "2026-07-30T10:40:00Z",
        ),
      ],
    },
    {
      topicId: "sample-garden",
      title: "A community garden for the north courtyard",
      author: sWho("Priya Okafor", "sample-priya"),
      body: null,
      path: p("priya", "community-garden"),
      activities: [
        sReply(
          "public",
          sC(
            "garden-robin",
            "garden-you",
            sWho("Robin Vale", "sample-robin"),
            "Count me in — I can bring tools on the first weekend.",
          ),
          [
            sC(
              "garden-jordan",
              null,
              sWho("Jordan Lee", "sample-jordan"),
              "Should we use raised beds or dig straight into the ground?",
            ),
            sC(
              "garden-you",
              "garden-jordan",
              me,
              "Raised beds near the wall — the soil there is thin.",
            ),
          ],
          "2026-07-30T09:12:00Z",
        ),
      ],
    },
  ];
}

/** Your own topic carrying all three comment threads plus ❤️s. */
function sampleOwnCard(me: DigestPerson, p: SamplePath): DigestTopicCard {
  return {
    topicId: "sample-mine",
    title: "Rethinking the weekly assembly format",
    author: me,
    body: null,
    path: p("you", "weekly-assembly"),
    activities: [
      sComment(
        "public",
        sC(
          "assembly-sam",
          null,
          sWho("Sam Whitfield", "sample-sam"),
          "This is exactly what we've needed — could we pair it with the newcomers session?",
        ),
        "2026-07-30T08:40:00Z",
      ),
      sComment(
        "host_only",
        sC(
          "assembly-eli",
          null,
          sWho("Eli Morgan", "sample-eli"),
          "Between us hosts — shall we trial it at the next session before proposing it more widely?",
        ),
        "2026-07-30T08:10:00Z",
      ),
      sComment(
        "admin_only",
        sC(
          "assembly-fatima",
          null,
          sWho("Fatima Noor", "sample-fatima"),
          "Draft note: tighten the opening paragraph before this goes to a vote.",
        ),
        "2026-07-30T07:58:00Z",
      ),
      {
        kind: "heart",
        hearters: [
          sWho("Amara Okafor", "sample-amara"),
          sWho("Tariq Hassan", "sample-tariq"),
          sWho("Rosa Delgado", "sample-rosa"),
          sWho("Ben Fletcher", "sample-ben"),
          sWho("Maya Iyer", "sample-maya"),
          sWho("Kwame Mensah", "sample-kwame"),
        ],
        at: sAt("2026-07-30T07:55:00Z"),
      },
    ],
  };
}

/** The three status cards: assigned, newly published (long body → truncated),
 * and your lingering draft. */
function sampleStatusCards(me: DigestPerson, p: SamplePath): DigestTopicCard[] {
  return [
    {
      topicId: "sample-assigned",
      title: "Welcome newcomers session",
      author: me,
      body: "A short, warm session for people in their first month: how the forum works, how topics get proposed and chosen, and who to ask for help. Ideally run monthly, thirty minutes, with two hosts.",
      path: p("you", "welcome-newcomers"),
      activities: [{ kind: "assignment", at: sAt("2026-07-29T18:20:00Z") }],
    },
    {
      topicId: "sample-new",
      title: "Open data standards for local councils",
      author: sWho("Hana Kim", "sample-hana"),
      body: "Councils publish the same kinds of data — budgets, planning applications, service performance — in wildly different shapes, which makes it almost impossible to compare across areas or build tools that work in more than one place. This topic proposes we back a small, shared schema for the handful of datasets that matter most, starting with spending over £500 and planning decisions, and that we lobby for it to be adopted as a default export from the common case-management systems. There's prior art in the national spending standard we can borrow from rather than invent.",
      path: p("hana", "open-data-standards"),
      activities: [{ kind: "new", at: sAt("2026-07-29T16:00:00Z") }],
    },
    {
      topicId: "sample-draft",
      title: "Half-finished idea about peer mentoring",
      author: me,
      body: "Pair each new member with someone a few months ahead of them — not a mentor exactly, just a first point of contact. Still need to work out how we match people and how light-touch to keep it.",
      path: p("you", "peer-mentoring"),
      activities: [{ kind: "draft", at: sAt("2026-07-20T10:00:00Z") }],
    },
  ];
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
  const me = sWho(args.name ?? "You", "sample-you");
  const p: SamplePath = (host, topic) =>
    `/f/${args.forumSlug}/${host}/${topic}`;
  return {
    userId: "sample-you",
    email: args.email,
    name: args.name,
    forumId: args.forumId,
    forumName: args.forumName,
    forumSlug: args.forumSlug,
    accent: args.accent ?? null,
    hostLabel: "Host",
    adminLabel: "Admin",
    topics: [
      ...sampleThreadCards(me, p, args.forumId),
      sampleOwnCard(me, p),
      ...sampleStatusCards(me, p),
    ],
    availabilityAsks: [
      {
        slotId: "sample-slot-proposed",
        startsAt: sAt("2026-08-08T09:00:00Z"),
        endsAt: sAt("2026-08-08T10:30:00Z"),
        location: "The Park",
        url: "",
        topicId: "sample-garden",
        topicTitle: "A community garden for the north courtyard",
        timetableId: args.forumId,
        updatedAt: sAt("2026-07-30T11:00:00Z"),
        isNew: true,
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
