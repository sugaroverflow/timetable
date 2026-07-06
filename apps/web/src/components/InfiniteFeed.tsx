"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";

type LoadMore = (
  slug: string,
  sort: string,
  host: string,
  offset: number,
) => Promise<{ cards: React.ReactNode; hasNext: boolean }>;

/**
 * Renders the server-rendered first page (children) and appends further
 * pages fetched via the loadMore server action when the sentinel scrolls
 * into view. Remount with a key when sort/host change.
 */
export function InfiniteFeed({
  slug,
  sort,
  host,
  pageSize,
  initialHasNext,
  loadMore,
  children,
}: {
  slug: string;
  sort: string;
  host: string;
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

  const loadNext = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setFailed(false);
    try {
      const res = await loadMore(slug, sort, host, offsetRef.current);
      offsetRef.current += pageSize;
      setPages((prev) => [...prev, res.cards]);
      setHasNext(res.hasNext);
    } catch {
      setFailed(true);
    } finally {
      loadingRef.current = false;
    }
  }, [loadMore, slug, sort, host, pageSize]);

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
      {failed ? (
        <div className="toolbar" style={{ justifyContent: "center" }}>
          <button type="button" className="btn" onClick={() => void loadNext()}>
            Couldn&rsquo;t load more topics — retry
          </button>
        </div>
      ) : hasNext ? (
        <div
          ref={sentinelRef}
          className="faint"
          style={{ textAlign: "center", padding: 12, fontSize: 13 }}
          aria-hidden
        >
          Loading more topics…
        </div>
      ) : null}
    </>
  );
}
