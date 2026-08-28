"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";

import type { FeedQuery } from "@/lib/feedPage";
import { takeFeedPosition, useFeedPositionMemory } from "@/lib/feedPosition";

type LoadMore = (
  query: FeedQuery,
) => Promise<{ cards: React.ReactNode; hasNext: boolean }>;

/** The scroller's tail: retry button on failure, sentinel while more
 * pages remain, nothing at the end. */
function FeedTail({
  failed,
  hasNext,
  sentinelRef,
  onRetry,
}: {
  failed: boolean;
  hasNext: boolean;
  sentinelRef: React.RefObject<HTMLDivElement | null>;
  onRetry: () => void;
}) {
  if (failed) {
    return (
      <div className="toolbar" style={{ justifyContent: "center" }}>
        <button type="button" className="btn" onClick={onRetry}>
          Couldn&rsquo;t load more topics — retry
        </button>
      </div>
    );
  }
  if (!hasNext) return null;
  return (
    <div
      ref={sentinelRef}
      className="faint"
      style={{ textAlign: "center", padding: 12, fontSize: 13 }}
      aria-hidden
    >
      Loading more topics…
    </div>
  );
}

/**
 * Renders the server-rendered first page (children) and appends further
 * pages fetched via the loadMore server action when the sentinel scrolls
 * into view. Remount with a key when sort/host change.
 */
export function InfiniteFeed({
  query,
  positionKey,
  refreshToken = "",
  pageSize,
  initialHasNext,
  loadMore,
  children,
}: {
  /** The feed request all appended pages repeat (offset varies per page). */
  query: Omit<FeedQuery, "offset">;
  /** Identifies this feed view for the feed-position-store — pass the same
   * string used as the element `key`, so a different sort/filter/seed is a
   * different view and never restores another view's position. */
  positionKey: string;
  /** Server-render marker: pass a fresh value on every server render so
   * appended pages can re-sync after a router.refresh() (see below). */
  refreshToken?: string;
  pageSize: number;
  initialHasNext: boolean;
  loadMore: LoadMore;
  children: React.ReactNode;
}) {
  const [pages, setPages] = useState<React.ReactNode[]>([]);
  const [hasNext, setHasNext] = useState(initialHasNext);
  const [failed, setFailed] = useState(false);
  const loadingRef = useRef(false);
  const offsetRef = useRef(pageSize);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const tokenRef = useRef(refreshToken);
  /** Offset to scroll to once the restored cards are committed. */
  const pendingScrollRef = useRef<number | null>(null);

  /** Fetch pages 1..count in order and return them; shared by the restore
   * and refresh paths, which both replay pages the user already had. */
  const fetchPages = useCallback(
    async (count: number, cancelled: () => boolean) => {
      const cards: React.ReactNode[] = [];
      let next = true;
      for (let i = 0; i < count; i += 1) {
        const res = await loadMore({ ...query, offset: (i + 1) * pageSize });
        if (cancelled()) return null;
        cards.push(res.cards);
        next = res.hasNext;
      }
      return { cards, next };
    },
    [loadMore, query, pageSize],
  );

  const loadNext = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setFailed(false);
    try {
      const res = await loadMore({ ...query, offset: offsetRef.current });
      offsetRef.current += pageSize;
      setPages((prev) => [...prev, res.cards]);
      setHasNext(res.hasNext);
    } catch {
      setFailed(true);
    } finally {
      loadingRef.current = false;
    }
  }, [loadMore, query, pageSize]);

  // After a router.refresh() (an action succeeded → new server render →
  // new refreshToken), the server-rendered first page (children) is fresh
  // but our appended pages are stale client-state snapshots. Re-fetch the
  // pages the user has already loaded so an edit/heart made on a
  // deep-scrolled card is visible in place. Same seed → same order, so
  // nothing jumps.
  useEffect(() => {
    if (tokenRef.current === refreshToken) return;
    tokenRef.current = refreshToken;
    if (offsetRef.current <= pageSize || loadingRef.current) return;
    let cancelled = false;
    void (async () => {
      loadingRef.current = true;
      try {
        const loaded = offsetRef.current / pageSize - 1;
        const fresh = await fetchPages(loaded, () => cancelled);
        if (!fresh) return;
        setPages(fresh.cards);
        setHasNext(fresh.next);
      } catch {
        // Keep the stale pages — the next scroll or refresh retries.
      } finally {
        loadingRef.current = false;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshToken, fetchPages, pageSize]);

  /* Back to the feed (2026-08-28): the pages this view had loaded are gone
   * with the unmounted subtree, so replay them, then put the viewport back.
   * Mount-only, and a no-op unless the arrival was a history traversal that
   * left a position behind — see feed-position-store. */
  useEffect(() => {
    const saved = takeFeedPosition(positionKey);
    if (!saved) return;
    // Hold the sentinel off: on a one-page document it is already in view,
    // so without this it would race us loading page two.
    loadingRef.current = true;
    let cancelled = false;
    void (async () => {
      try {
        const restored = await fetchPages(saved.pages, () => cancelled);
        if (!restored) return;
        offsetRef.current = (saved.pages + 1) * pageSize;
        pendingScrollRef.current = saved.scrollY;
        setPages(restored.cards);
        setHasNext(restored.next);
      } catch {
        // Restoring is a convenience; a failure just leaves you on page one.
      } finally {
        loadingRef.current = false;
      }
    })();
    return () => {
      cancelled = true;
    };
    // Mount-only: the saved position is consumed by the first run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Records the position as you scroll, and performs the pending scroll
   * once the restored pages are committed. */
  useFeedPositionMemory(positionKey, pages.length, pendingScrollRef);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasNext || failed) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void loadNext();
      },
      { rootMargin: "600px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNext, failed, loadNext]);

  return (
    <>
      {children}
      {pages.map((cards, i) => (
        <Fragment key={i}>{cards}</Fragment>
      ))}
      <FeedTail
        failed={failed}
        hasNext={hasNext}
        sentinelRef={sentinelRef}
        onRetry={() => void loadNext()}
      />
    </>
  );
}
