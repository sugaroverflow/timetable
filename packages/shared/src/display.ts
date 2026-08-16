/**
 * Small display primitives shared across web and email rendering
 * (housekeeping 2026-08-13 — each of these existed as 2+ hand-kept
 * copies that could drift).
 */

/** How many avatar palette slots exist (web: tokens.css --avatar-1…8;
 * email: its literal AVATAR_PALETTE — email clients can't read CSS). */
const AVATAR_SLOT_COUNT = 8;

/** Deterministic palette slot (0-based) for a name/id seed — the SAME
 * hash in app and email, so a person's avatar colour matches across
 * both. */
export function avatarSlot(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) % AVATAR_SLOT_COUNT;
}

/** Up-to-two-letter initials for avatar fallbacks. */
export function initials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/** A full #rrggbb hex colour — the guard used everywhere a colour string
 * is about to reach an SSR <style> tag or an OG card (never inject an
 * unvalidated colour). */
export const HEX_COLOUR = /^#[0-9a-fA-F]{6}$/;

/** Canonical topic permalink: /f/{forum}/{host}/{topic}. Topics belong to
 * hosts, so the owner appears in the path; resolution is by topic slug
 * alone, and the route canonical-redirects stale host segments — so when
 * the host has no member slug (left the forum, or a pre-profile row the
 * 0019 backfill missed), callers can pass hostId as a working stand-in.
 * Returns null when the topic slug (or both host identifiers) is missing. */
export function topicPath(
  forumSlug: string,
  hostSlug: string | null | undefined,
  topicSlug: string | null | undefined,
  hostId?: string | null,
): string | null {
  const host = hostSlug || hostId;
  if (!host || !topicSlug) return null;
  return `/f/${forumSlug}/${host}/${topicSlug}`;
}
