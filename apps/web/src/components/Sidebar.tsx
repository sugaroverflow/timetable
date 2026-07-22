"use client";

import { usePathname } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";

import {
  closeSidebar,
  isSidebarOpen,
  subscribeSidebar,
} from "@/lib/sidebarStore";

/** Left navigation rail (QA #42): always visible on desktop; on mobile a
 * drawer that slides in from the left (product feedback round 2), toggled by
 * the topbar hamburger. Closes on navigation, Escape, or a backdrop tap. */
export function Sidebar({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const open = useSyncExternalStore(
    subscribeSidebar,
    isSidebarOpen,
    () => false,
  );

  useEffect(() => {
    closeSidebar();
  }, [pathname]);

  // While the drawer is open: Escape closes it and the page behind doesn't
  // scroll. The hamburger only renders on mobile, so `open` is never true on
  // desktop and the scroll lock can't affect the desktop rail.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeSidebar();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  return (
    <>
      {open ? (
        <div className="sidebar-backdrop" onClick={closeSidebar} aria-hidden />
      ) : null}
      <aside className={`sidebar${open ? " open" : ""}`}>{children}</aside>
    </>
  );
}
