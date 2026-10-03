/**
 * Web Push (docs/web-push-plan.md, #368) — the pure half: which kinds alert
 * by default, how a membership's Push switches resolve, and how an alert's
 * text is trimmed. Shared by the API (subscribe validation, the sweep) and
 * the web app (the Push column), so the two can't drift.
 *
 * The Push column is a second switch per row of `DIGEST_KINDS`. Its audience
 * rules are the digest's (`digestKindApplies`): a row hidden from you for
 * email is hidden for push too.
 */
import type { DigestKind, DigestKinds } from "./settings";

/** Kinds with no moment to alert on (plan §1): `drafts` is a reminder
 * computed when the digest runs, so its Push cell is a dash, not a switch,
 * and it never alerts whatever is stored. */
export const PUSH_EVENTLESS_KINDS = [
  "drafts",
] as const satisfies readonly DigestKind[];
export type PushEventlessKind = (typeof PUSH_EVENTLESS_KINDS)[number];

/** The kinds that can push — every digest kind but the eventless ones. */
export type PushKind = Exclude<DigestKind, PushEventlessKind>;

export function isPushEventlessKind(
  kind: DigestKind,
): kind is PushEventlessKind {
  return (PUSH_EVENTLESS_KINDS as readonly DigestKind[]).includes(kind);
}

/** Per-kind Push defaults (Ed, 2026-10-03): things aimed at YOU are on,
 * broadcast news is off. Flipping a default is a one-line change here.
 * `drafts` is listed (false) only so the map covers every row; it is
 * eventless and `isPushKindEnabled` never reads it. */
export const PUSH_KIND_DEFAULTS: Record<DigestKind, boolean> = {
  // Aimed at you — on.
  comments: true,
  replies: true,
  mentions: true,
  lounge: true,
  sessions: true,
  sessionsHostHearted: true,
  availabilityAsks: true,
  // Broadcast news — off.
  commentsHearted: false,
  commentsHostHearted: false,
  hearts: false,
  hostHearts: false,
  newTopics: false,
  newTopicsHost: false,
  pendingReview: false,
  slotReleases: false,
  newMembers: false,
  // Eventless.
  drafts: false,
};

/** A membership's per-forum Push switch set, stored as the optional `push`
 * field of `MembershipDigestSettings` ({}/absent = all defaults). */
export type PushKinds = DigestKinds;

/** Whether one kind alerts for this member: the membership's own Push
 * switch, else `PUSH_KIND_DEFAULTS`. Eventless kinds are always false.
 * There is deliberately no forum-defaults layer (unlike email): push is
 * opt-in per device, so a forum can't switch anyone's phone on. */
export function isPushKindEnabled(
  kinds: PushKinds | null | undefined,
  kind: DigestKind,
): boolean {
  if (isPushEventlessKind(kind)) return false;
  return kinds?.[kind] ?? PUSH_KIND_DEFAULTS[kind];
}

/** The Web Push `Urgency` header for a kind (plan §2): `high` for the
 * on-by-default (aimed-at-you) kinds, `normal` for broadcast news. Also
 * `high` for the switch-less sent-back notice, passed as `null`. */
export function pushUrgency(kind: DigestKind | null): "high" | "normal" {
  if (kind === null) return "high";
  return PUSH_KIND_DEFAULTS[kind] ? "high" : "normal";
}

// ---------------------------------------------------------------------------
// Devices

/** Most devices one user may have subscribed at once (plan §2: per user,
 * not per membership, since a subscription is a device). */
export const PUSH_DEVICE_CAP = 10;

/** Longest endpoint URL accepted. Real ones are ~200–500 characters. */
export const PUSH_ENDPOINT_MAX = 1024;

/** Longest device label kept (e.g. "Chrome on Android"). */
export const PUSH_LABEL_MAX = 60;

// A P-256 public key in uncompressed form is 65 bytes starting 0x04, which
// base64url-encodes to 87 characters starting "B"; the auth secret is 16
// bytes, 22 characters. Padding is tolerated and stripped.
const P256DH_RE = /^B[A-Za-z0-9_-]{86}$/;
const AUTH_RE = /^[A-Za-z0-9_-]{22}$/;

/** The browser's payload keys from `PushSubscription.toJSON().keys`,
 * normalised to unpadded base64url, or null when either is malformed. The
 * point itself is checked by the encryption, not here. */
export function normalizePushKeys(
  p256dh: unknown,
  auth: unknown,
): { p256dh: string; auth: string } | null {
  if (typeof p256dh !== "string" || typeof auth !== "string") return null;
  const key = p256dh.trim().replace(/=+$/, "");
  const secret = auth.trim().replace(/=+$/, "");
  if (!P256DH_RE.test(key) || !AUTH_RE.test(secret)) return null;
  return { p256dh: key, auth: secret };
}

/** A device label as stored: single-line, trimmed, capped; null if empty. */
export function normalizePushLabel(label: unknown): string | null {
  if (typeof label !== "string") return null;
  const flat = label.replace(/\s+/g, " ").trim();
  if (!flat) return null;
  return trimAtWord(flat, PUSH_LABEL_MAX);
}

// ---------------------------------------------------------------------------
// Alert text (plan §1 "What an alert looks like")

/** About how long an alert's body line may be, in characters. */
export const PUSH_BODY_MAX = 100;

/** Cap on the title ("who in where · forum"); names and titles are short,
 * this only stops a pathological topic title. */
export const PUSH_TITLE_MAX = 120;

/** The encrypted payload's plaintext budget (the protocol limit is 4 KB;
 * plan §2 keeps a margin for the encryption overhead). */
export const PUSH_PAYLOAD_MAX_BYTES = 3072;

const ELLIPSIS = "…";

/** Trim to at most `max` characters (code points, so an emoji is never
 * split), cutting back to a word boundary when one is reasonably close, and
 * ending with "…" when anything was dropped. */
export function trimAtWord(text: string, max: number): string {
  const chars = Array.from(text);
  if (chars.length <= max) return text;
  const room = Math.max(0, max - 1);
  let cut = chars.slice(0, room).join("");
  const space = cut.search(/\s\S*$/);
  // Only back up to a space if that keeps most of the line.
  if (space > 0 && Array.from(cut.slice(0, space)).length >= room * 0.6) {
    cut = cut.slice(0, space);
  }
  return `${cut.replace(/[\s.,;:!?…-]+$/u, "")}${ELLIPSIS}`;
}

/** Markdown → plain text, enough for a one-line preview: images dropped,
 * links reduced to their text, emphasis/code/heading/quote/list markers and
 * any HTML tags removed. */
export function markdownToPlainText(md: string): string {
  return md
    .replace(/\r/g, "")
    .replace(/<[^>]*>/g, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}(?:#{1,6}\s+|>\s?|[-*+]\s+|\d+[.)]\s+)/gm, "")
    .replace(/[*_`~]/g, "");
}

/** The alert body: the first non-empty line of the message as plain text,
 * trimmed at a word boundary to about `PUSH_BODY_MAX` characters. Pass
 * `markdown: true` for Lounge opening posts and topic bodies. Empty when
 * the message has no text (an image-only post, say). */
export function pushBodyLine(
  message: string,
  options: { markdown?: boolean; max?: number } = {},
): string {
  const text = options.markdown ? markdownToPlainText(message) : message;
  const line =
    text
      .split("\n")
      .map((l) => l.replace(/\s+/g, " ").trim())
      .find((l) => l.length > 0) ?? "";
  return trimAtWord(line, options.max ?? PUSH_BODY_MAX);
}

/** The alert title: "who in where", plus " · {forum}" for people in more
 * than one forum. Capped at `PUSH_TITLE_MAX`. */
export function pushTitle(parts: {
  who: string;
  where: string;
  forum?: string | null;
}): string {
  const flat = (s: string) => s.replace(/\s+/g, " ").trim();
  let title = `${flat(parts.who)} in ${flat(parts.where)}`;
  if (parts.forum && flat(parts.forum)) title += ` · ${flat(parts.forum)}`;
  return trimAtWord(title, PUSH_TITLE_MAX);
}

/** A tap target is a same-origin PATH: starts with "/" but not "//" (a
 * protocol-relative URL would leave the site), no backslashes (some
 * browsers read "/\\evil" as "//evil"), and no control characters. The
 * service worker repeats this check. */
export function isSafePushUrl(url: string): boolean {
  return (
    url.startsWith("/") &&
    !url.startsWith("//") &&
    !url.includes("\\") &&
    // eslint-disable-next-line no-control-regex
    !/[\u0000-\u001f\u007f]/.test(url) &&
    url.length <= 1024
  );
}

export type PushPayload = {
  title: string;
  body: string;
  url: string;
  /** One per thread (`topic:<id>:<tab>`, `lounge:<rootId>`), so a later
   * alert in the same thread replaces the earlier one on the device. */
  tag: string;
};

/** UTF-8 byte length (shared has no DOM or Node types for TextEncoder). */
export function utf8ByteLength(s: string): number {
  let bytes = 0;
  for (const ch of s) {
    const cp = ch.codePointAt(0) ?? 0;
    bytes += cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
  }
  return bytes;
}

/** The JSON plaintext the service worker reads, with the title and body
 * trimmed to their limits and the whole kept under
 * `PUSH_PAYLOAD_MAX_BYTES`. Null when the url isn't a safe same-origin
 * path or the payload can't be made to fit — the caller skips that alert. */
export function serializePushPayload(payload: PushPayload): string | null {
  if (!isSafePushUrl(payload.url)) return null;
  const tag = payload.tag.slice(0, 128);
  const title = trimAtWord(payload.title.trim(), PUSH_TITLE_MAX);
  let body = trimAtWord(payload.body.trim(), PUSH_BODY_MAX);
  for (;;) {
    const json = JSON.stringify({ title, body, url: payload.url, tag });
    if (utf8ByteLength(json) <= PUSH_PAYLOAD_MAX_BYTES) return json;
    if (!body) return null;
    const shorter = Array.from(body).length - 20;
    body = shorter > 1 ? trimAtWord(body, shorter) : "";
  }
}
