"use client";

import { Menu } from "lucide-react";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";

import {
  isSidebarOpen,
  subscribeSidebar,
  toggleSidebar,
} from "@/lib/sidebarStore";

/** Mobile-only hamburger at the left of the topbar (QA #59 round 3) —
 * replaces the in-content "Menu" button. Renders only inside a timetable,
 * where the sidebar drawer exists. */
export function TopbarHamburger() {
  const pathname = usePathname();
  const open = useSyncExternalStore(
    subscribeSidebar,
    isSidebarOpen,
    () => false,
  );

  if (!/^\/t\//.test(pathname ?? "")) return null;

  return (
    <button
      type="button"
      className="topbar-hamburger"
      aria-expanded={open}
      aria-label={open ? "Close menu" : "Open menu"}
      onClick={toggleSidebar}
    >
      <Menu size={16} aria-hidden />
    </button>
  );
}
