"use client";

import { createContext, useContext, useMemo, useState } from "react";

/** Bumped counters — the teaser reacts to any change; 0 = never asked.
 * Open and toggle are separate channels because they mean different
 * things: posting a comment must never fold the tree away. */
type CommentsOpen = {
  requestId: number;
  requestOpen(): void;
  toggleId: number;
  requestToggle(): void;
};

const Ctx = createContext<CommentsOpen>({
  requestId: 0,
  requestOpen: () => {},
  toggleId: 0,
  requestToggle: () => {},
});

/**
 * Card-level "open the comments" channel (QA 2026-08-13): the actions
 * row's 💬 button and the top-composer live in different client islands
 * from the comment-teaser, but commenting or clicking 💬 should reveal
 * the collapsed tree. The Comments tab button uses the toggle channel
 * instead (Ed, QA 2026-08-16): clicking the tab you are already on opens
 * the tree, and clicking it again folds it back. The provider wraps a
 * card's tabs + comment section; consumers without a provider get a safe
 * no-op (permalink and panel surfaces have no teaser to open).
 */
export function CommentsOpenScope({ children }: { children: React.ReactNode }) {
  const [requestId, setRequestId] = useState(0);
  const [toggleId, setToggleId] = useState(0);
  const value = useMemo(
    () => ({
      requestId,
      requestOpen: () => setRequestId((n) => n + 1),
      toggleId,
      requestToggle: () => setToggleId((n) => n + 1),
    }),
    [requestId, toggleId],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCommentsOpen(): CommentsOpen {
  return useContext(Ctx);
}
