"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";

type LoadMore = (
  slug: string,
  sort: string,
  host: string,
  offset: number,
  hearted?: boolean,
  seed?: string,
  heartedBy?: string,
  hostHearted?: boolean,
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
  slug,
  sort,
  host,
  hearted = false,
  seed = "",
  heartedBy = "",
  hostHearted = false,
  refreshToken = "",
  pageSize,
  initialHasNext,
  loadMore,
  children,
}: {
  slug: string;
  sort: string;
  host: string;
  hearted?: boolean;
  seed?: string;
  heartedBy?: string;
  hostHearted?: boolean;
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

  const loadNext = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setFailed(false);
    try {
      const res = await loadMore(
        slug,
        sort,
        host,
        offsetRef.current,
        hearted,
        seed,
        heartedBy,
        hostHearted,
      );
      offsetRef.current += pageSize;
      setPages((prev) => [...prev, res.cards]);
      setHasNext(res.hasNext);
    } catch {
      setFailed(true);
    } finally {
      loadingRef.current = false;
    }
  }, [
    loadMore,
    slug,
    sort,
    host,
    hearted,
    seed,
    heartedBy,
    hostHearted,
    pageSize,
  ]);

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
        const fresh: React.ReactNode[] = [];
        let next = true;
        for (let off = pageSize; off < offsetRef.current; off += pageSize) {
          const res = await loadMore(
            slug,
            sort,
            host,
            off,
            hearted,
            seed,
            heartedBy,
            hostHearted,
          );
          if (cancelled) return;
          fresh.push(res.cards);
          next = res.hasNext;
        }
        setPages(fresh);
        setHasNext(next);
      } catch {
        // Keep the stale pages — the next scroll or refresh retries.
      } finally {
        loadingRef.current = false;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    refreshToken,
    loadMore,
    slug,
    sort,
    host,
    hearted,
    seed,
    heartedBy,
    hostHearted,
    pageSize,
  ]);

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
