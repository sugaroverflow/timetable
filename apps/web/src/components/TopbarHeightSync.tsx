"use client";

import { useEffect } from "react";

/**
 * Keeps `--topbar-h` equal to the topbar's real rendered height. The
 * token's 55px is only an SSR estimate: the bar's height varies with its
 * content (text-only brand vs 30px logo, Clerk avatar, wrapped forum
 * names), and sticky elements pinned to a stale value either leave a gap
 * that scrolling content shows through or float below the bar
 * (QA 2026-07-28). Rounds up so drift tucks pinned elements under the
 * translucent bar rather than opening a hairline gap.
 */
export function TopbarHeightSync() {
  useEffect(() => {
    const bar = document.querySelector(".topbar");
    if (!(bar instanceof HTMLElement)) return;
    const root = document.documentElement;
    const sync = () =>
      root.style.setProperty(
        "--topbar-h",
        `${Math.ceil(bar.getBoundingClientRect().height)}px`,
      );
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(bar);
    return () => {
      ro.disconnect();
      root.style.removeProperty("--topbar-h");
    };
  }, []);
  return null;
}
