"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

const INTERVAL_MS = 20_000;

/** Keeps the activity log live (issue #58): re-runs the server render on an
 * interval while the tab is visible, and immediately on tab return, so new
 * events appear without a manual reload. Polling a server component beats a
 * new API surface at this scale; the interval pauses in hidden tabs. */
export function LiveLogSync() {
  const router = useRouter();

  useEffect(() => {
    const refreshIfVisible = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const id = setInterval(refreshIfVisible, INTERVAL_MS);
    document.addEventListener("visibilitychange", refreshIfVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", refreshIfVisible);
    };
  }, [router]);

  return (
    <span
      className="live-dot"
      title="Live — new activity appears automatically"
    >
      <span className="live-dot-pulse" aria-hidden />
      Live
    </span>
  );
}
