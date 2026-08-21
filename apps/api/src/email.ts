import type {
  DigestActivity,
  DigestComment,
  DigestPerson,
  DigestSessionLine,
  DigestSlotRelease,
  DigestTopicCard,
  ForumDigest,
} from "@timetable/core";
import { avatarSlot, initials } from "@timetable/shared";

const EMAIL_FROM = process.env.EMAIL_FROM ?? "Topic <no-reply@example.com>";

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Reads at call time so tests (and the app spec) can vary them. */
const maxRps = () => Number(process.env.RESEND_MAX_RPS ?? 2) || 2;
const maxAttempts = () => Number(process.env.EMAIL_MAX_ATTEMPTS ?? 4) || 4;

/**
 * Global send pacing (ops R4). Resend's default limit is 2 requests/second,
 * and the digest job fires a chunk of recipients concurrently — unthrottled,
 * the first run against a real cohort hits 429 immediately. Every send in the
 * process queues through one chain so the API-wide rate never exceeds
 * RESEND_MAX_RPS, no matter how many callers are in flight.
 */
let sendChain: Promise<unknown> = Promise.resolve();
let lastSendStartedAt = 0;

function schedule<T>(task: () => Promise<T>): Promise<T> {
  const result = sendChain.then(async () => {
    const gap = 1000 / maxRps();
    const wait = lastSendStartedAt + gap - Date.now();
    if (wait > 0) await sleep(wait);
    lastSendStartedAt = Date.now();
    return task();
  });
  // Keep the chain alive whatever this task did, or one rejection would
  // poison every subsequent send.
  sendChain = result.then(
    () => {},
    () => {},
  );
  return result;
}

/** 429 and 5xx are worth another go; 4xx (bad address, bad key) never is. */
const isRetryable = (status: number) => status === 429 || status >= 500;

function retryDelayMs(res: Response, attempt: number): number {
  const header = res.headers.get("retry-after");
  const seconds = header ? Number(header) : NaN;
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  // Exponential backoff, capped so a wedged provider can't stall the run.
  return Math.min(500 * 2 ** (attempt - 1), 8_000);
}

/**
 * Send an email via Resend. With no RESEND_API_KEY (local dev), the message is
 * logged to the console instead.
 *
 * Paced (see `schedule`) and retried on 429/5xx and network errors. It still
 * throws once attempts are exhausted — but the digest job now isolates each
 * recipient, so a throw no longer takes the whole run down with it.
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

  const attempts = maxAttempts();
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    let res: Response;
    try {
      res = await schedule(() =>
        fetch("https://api.resend.com/emails", {
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
        }),
      );
    } catch (err) {
      // Network-level failure (DNS, socket, timeout) — always worth a retry.
      lastError = err;
      if (attempt === attempts) break;
      await sleep(Math.min(500 * 2 ** (attempt - 1), 8_000));
      continue;
    }

    if (res.ok) return;

    lastError = new Error(`Resend error ${res.status}: ${await res.text()}`);
    if (!isRetryable(res.status) || attempt === attempts) break;
    await sleep(retryDelayMs(res, attempt));
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`Resend send failed: ${String(lastError)}`);
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

/** Walk every href in rendered email HTML and offer the app links (those
 * under linkBase) to `rewrite`; it returns the replacement URL, or null
 * to leave the link alone. Non-app links are never touched. */
function rewriteAppLinks(
  html: string,
  rewrite: (url: string) => string | null,
): string {
  return html.replace(/href="([^"]*)"/g, (full, raw: string) => {
    const url = raw.replace(/&amp;/g, "&");
    if (url !== linkBase && !url.startsWith(`${linkBase}/`)) return full;
    const next = rewrite(url);
    return next == null ? full : `href="${esc(next)}"`;
  });
}

/** Stamp every app link in a rendered digest with its send row's id
 * (`dg=<id>`), so ANY click marks that digest read — the comment threads
 * it showed become seen (2026-08-13). Must run BEFORE
 * wrapLinksWithSignInTicket so the param rides inside redirect_url. */
export function stampDigestLinks(html: string, sendId: string): string {
  return rewriteAppLinks(html, (url) => {
    const [base, fragment] = url.split("#", 2);
    const sep = base!.includes("?") ? "&" : "?";
    return `${base}${sep}dg=${encodeURIComponent(sendId)}${
      fragment ? `#${fragment}` : ""
    }`;
  });
}

/** Rewrite every app link in a rendered email to hop through /sign-in with
 * a single-use Clerk ticket, so ANY link signs the recipient in (issue
 * #230). The ticket is single-use but one per email is enough: the first
 * click consumes it and establishes a session, after which /sign-in passes
 * straight through to redirect_url; a burnt ticket on a signed-out device
 * falls back to the OTP form with the same destination. Links outside
 * linkBase and /sign-in links (the invite CTA) are left alone. */
export function wrapLinksWithSignInTicket(
  html: string,
  ticket: string,
): string {
  return rewriteAppLinks(html, (url) => {
    const path = url.slice(linkBase.length) || "/";
    if (path.startsWith("/sign-in")) return null;
    return `${linkBase}/sign-in?__clerk_ticket=${encodeURIComponent(
      ticket,
    )}&redirect_url=${encodeURIComponent(path)}`;
  });
}

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

// Initials-avatar palette — literal hexes mirroring tokens.css's
// --avatar-1…8 (email clients can't read CSS); the shared avatarSlot hash
// guarantees the colour matches the app's Avatar for the same person.
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
  return AVATAR_PALETTE[avatarSlot(seed)]!;
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
  aim: string,
): string {
  const name = personName(node.comment.author);
  const color = node.isNew ? accent : E.muted;
  const bodyCls = node.isNew ? "" : ' class="em-muted"';
  const line = `<div style="padding-left:${depth * INDENT}px;margin:3px 0;white-space:pre-wrap;">${name}<span class="em-muted" style="color:${E.muted};">: </span><span${bodyCls} style="color:${color};">${esc(node.comment.body)}</span></div>`;
  if (!node.isNew || !path) return line;
  const id = node.comment.id;
  const href = `${linkBase}${path}?${aim}&reply=${encodeURIComponent(id)}#comment-${encodeURIComponent(id)}`;
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
  aim: string,
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
    lines.push(threadLine(node, depth, card.path, accent, aim));
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

/** Every 💙 on its own line — same as ❤️s, the 💙 says who it's from
 * (fellow hosts; the "{hostLabel}s" heading is on the caller). */
function renderHostHearts(hearters: DigestPerson[]): string {
  return hearters
    .map((h) => `<div style="margin:3px 0;">💙 ${personName(h)}</div>`)
    .join("");
}

const STATUS_PILLS: Record<
  "new" | "pending" | "assignment" | "draft",
  [string, string, string]
> = {
  // [label, background, text]
  new: ["New", "#e8f6ec", "#207a32"],
  pending: ["Ready to review", "#fdf1e3", "#b25e09"],
  assignment: ["Assigned to you", "#eaeefe", "#2f54eb"],
  draft: ["Unpublished draft", "#eef0f5", "#7d8694"],
};

function statusPill(kind: "new" | "pending" | "assignment" | "draft"): string {
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

/** Aims a reply link at the tab that actually holds the comment.
 *
 * The web app's topic-tabs unmounts its inactive panes, so a link to a
 * {host}-only or drafting comment lands on a card with neither the reply
 * composer nor the `#comment-` anchor on the page (Ed, 2026-08-21). The
 * values are `TopicTab.value`; `topic` aims the request at ONE card, since
 * the fallback pages render a strip per topic. Mirrors
 * `TAB_FOR_VISIBILITY` in the web app's notifications page. */
function replyAim(
  visibility: "public" | "host_only" | "admin_only",
  topicId: string,
): string {
  const tab =
    visibility === "host_only"
      ? "host"
      : visibility === "admin_only"
        ? "admin"
        : "comments";
  return `tab=${tab}&topic=${encodeURIComponent(topicId)}`;
}

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
        renderThreadTree(card, acts, accent, replyAim(vis, card.topicId))
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
    ): a is Extract<
      DigestActivity,
      { kind: "new" | "pending" | "assignment" | "draft" }
    > =>
      a.kind === "new" ||
      a.kind === "pending" ||
      a.kind === "assignment" ||
      a.kind === "draft",
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
  // the actions row sits above the thread (QA 2026-07-30). 💙s ride along
  // beneath them (host hearts, 2026-08-04).
  if (heart && heart.kind === "heart") {
    sections.push(renderHearts(heart.hearters));
  }
  const hostHeart = card.activities.find((a) => a.kind === "hostHeart");
  if (hostHeart && hostHeart.kind === "hostHeart") {
    sections.push(renderHostHearts(hostHeart.hearters));
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
  const counts = {
    comment: 0,
    reply: 0,
    heart: 0,
    hostHeart: 0,
    new: 0,
    pending: 0,
    assignment: 0,
  };
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
  n(counts.comment, "comment", "comments");
  n(counts.reply, "reply", "replies");
  n(counts.heart, "topic with new ❤️", "topics with new ❤️");
  n(counts.hostHeart, "topic with new 💙", "topics with new 💙");
  n(counts.new, "new topic", "new topics");
  n(counts.pending, "topic to review", "topics to review");
  n(counts.assignment, "topic assigned to you", "topics assigned to you");
  n(confirmedNew, "session confirmed", "sessions confirmed");
  const asksNew = digest.availabilityAsks.filter((s) => s.isNew).length;
  n(
    asksNew,
    "session wants your availability",
    "sessions want your availability",
  );
  n(digest.newSlots.length, "new date released", "new dates released");
  n(digest.newMembers.length, "new member", "new members");
  return bits.join(", ");
}

/** "New dates released" (round 2): slots created since the window that
 * hosts can claim — when/where lines linking to the calendar. */
function renderNewSlotsCard(
  slots: DigestSlotRelease[],
  forumSlug: string,
  accent: string,
): string {
  if (slots.length === 0) return "";
  const lines = slots
    .map((s) => {
      const where =
        s.locations.length > 0 ? ` · ${esc(s.locations.join(", "))}` : "";
      return (
        `<div style="margin:6px 0;">` +
        `<a href="${esc(`${linkBase}/f/${forumSlug}/calendar`)}" style="color:${accent};font-weight:600;text-decoration:none;">${esc(
          sessionWhen({
            startsAt: s.startsAt,
            endsAt: s.endsAt,
          } as DigestSessionLine),
        )}</a>` +
        `<span class="em-muted" style="color:${E.muted};font-size:13px;">${where}</span>` +
        `</div>`
      );
    })
    .join("");
  return (
    `<div class="em-card" style="background:${E.card};border:1px solid ${E.line};border-radius:12px;padding:16px 18px;margin:0 0 12px;">` +
    `<div style="font-size:17px;font-weight:700;line-height:1.3;">New dates released</div>` +
    `<div class="em-muted" style="color:${E.muted};font-size:13px;margin-top:2px;">Fresh slots on the calendar — claim one for your topic.</div>` +
    `<div style="margin-top:8px;">${lines}</div></div>`
  );
}

/** "New members" (round 2, admins): first sign-ins since the window. */
function renderNewMembersCard(
  members: DigestPerson[],
  forumSlug: string,
  accent: string,
): string {
  if (members.length === 0) return "";
  const lines = members
    .map(
      (m) =>
        `<div style="margin:3px 0;">${personLink(forumSlug, m, accent)} signed in for the first time</div>`,
    )
    .join("");
  return (
    `<div class="em-card" style="background:${E.card};border:1px solid ${E.line};border-radius:12px;padding:16px 18px;margin:0 0 12px;">` +
    `<div style="font-size:17px;font-weight:700;line-height:1.3;">New members</div>` +
    `<div style="margin-top:8px;">${lines}</div></div>`
  );
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
    renderNewSlotsCard(digest.newSlots, digest.forumSlug, accent),
    renderNewMembersCard(digest.newMembers, digest.forumSlug, accent),
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
