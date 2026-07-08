"use client";

import { usePathname } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";

import {
  closeSidebar,
  isSidebarOpen,
  subscribeSidebar,
} from "@/lib/sidebarStore";

/** Left navigation rail (QA #42): always visible on desktop, a drawer on
 * mobile toggled by the topbar hamburger (QA #59 round 3). Closes itself
 * after navigation. */
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

  return <aside className={`sidebar${open ? " open" : ""}`}>{children}</aside>;
}
