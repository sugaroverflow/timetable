"use client";

import { useEffect } from "react";

/**
 * feed-position-store (2026-08-28) — how far down the feed you were, so
 * pressing Back brings you back to it.
 *
 * The infinite feed keeps its appended pages in React state
 * ([[InfiniteFeed]]'s `pages`). Opening a topic is a route change, so the
 * feed subtree unmounts and that state is destroyed; on Back the page
 * re-renders with only its server-rendered first page. The document is
 * then far shorter than the offset the browser is trying to restore, the
 * restore clamps, and you land at the top with no way back to your place.
 *
 * So we remember two numbers per feed view — how many extra pages were
 * loaded, and the scroll offset — and replay them on the way back.
 *
 * Module-level like [[comment-draft-store]], deliberately: this is a
 * within-visit convenience, so it dies with the JS context and a reload
 * is a clean slate. Nothing here is worth persisting into a new session.
 */

export type FeedPosition = {
  /** Extra pages loaded beyond the server-rendered first one. */
  pages: number;
  /** `window.scrollY` when we last looked. */
  scrollY: number;
};

const positions = new Map<string, FeedPosition>();

/**
 * Only a history traversal should restore a position. Clicking through to
 * a feed you were once deep in should still start you at the top — the
 * default sort mints a fresh shuffle seed per visit (so its key differs
 * anyway), but the fixed sorts reuse their URL and would otherwise dump
 * you back down the page for no reason you asked for.
 */
let traversed = false;

/** Arms the next restore. Called by the popstate listener below; exported
 * so the gate can be exercised without a DOM. */
export function markTraversed(): void {
  traversed = true;
}

/** Disarms it. A Back onto a page with no feed would otherwise leave the
 * flag set, and a later click-through to a feed you had once scrolled deep
 * would restore a position you never asked for. A click-initiated
 * navigation is by definition not a traversal, so any click disarms —
 * safely, because a real Back re-arms on its own popstate afterwards. */
export function markInteracted(): void {
  traversed = false;
}

if (typeof window !== "undefined") {
  window.addEventListener("popstate", markTraversed);
  window.addEventListener("click", markInteracted, { capture: true });
}

export function saveFeedPosition(key: string, position: FeedPosition): void {
  positions.set(key, position);
}

/**
 * The position to restore for this feed view, or null. Consumes both the
 * entry and the traversal flag, so one Back restores once.
 */
export function takeFeedPosition(key: string): FeedPosition | null {
  if (!traversed) return null;
  traversed = false;
  const position = positions.get(key);
  if (!position || position.pages <= 0) return null;
  positions.delete(key);
  return position;
}

/**
 * The remembering half, kept out of the feed component: records the
 * position as you scroll, and performs the pending scroll once the
 * restored pages are actually committed to the DOM (before that there is
 * no document tall enough to scroll down).
 */
export function useFeedPositionMemory(
  key: string,
  pageCount: number,
  pendingScrollRef: React.RefObject<number | null>,
): void {
  useEffect(() => {
    const target = pendingScrollRef.current;
    if (target == null || pageCount === 0) return;
    pendingScrollRef.current = null;
    window.scrollTo(0, target);
  }, [pageCount, pendingScrollRef]);

  useEffect(() => {
    const remember = () =>
      saveFeedPosition(key, { pages: pageCount, scrollY: window.scrollY });
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        remember();
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    // Also on every append, so a page loaded after the last scroll event
    // still counts when you leave.
    remember();
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [key, pageCount]);
}
