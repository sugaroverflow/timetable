"use client";

import { createContext, useContext, useMemo, useState } from "react";

/** Bumped counter — the teaser opens on any change; 0 = never requested. */
type CommentsOpen = { requestId: number; requestOpen(): void };

const Ctx = createContext<CommentsOpen>({
  requestId: 0,
  requestOpen: () => {},
});

/**
 * Card-level "open the comments" channel (QA 2026-08-13): the actions
 * row's 💬 button and the top-composer live in different client islands
 * from the comment-teaser, but commenting or clicking 💬 should reveal
 * the collapsed tree. The provider wraps a card's actions + comment
 * section; consumers without a provider get a safe no-op (permalink and
 * panel surfaces have no teaser to open).
 */
export function CommentsOpenScope({ children }: { children: React.ReactNode }) {
  const [requestId, setRequestId] = useState(0);
  const value = useMemo(
    () => ({ requestId, requestOpen: () => setRequestId((n) => n + 1) }),
    [requestId],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCommentsOpen(): CommentsOpen {
  return useContext(Ctx);
}
