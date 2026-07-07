"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";

/** Left navigation rail (QA #42): always visible on desktop, collapsed
 * behind a menu button on mobile. Closes itself after navigation. */
export function Sidebar({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close after navigation — state adjustment during render (not an
  // effect), per react-hooks/set-state-in-effect.
  const [lastPathname, setLastPathname] = useState(pathname);
  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        className="sidebar-toggle btn"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        ☰ Menu
      </button>
      <aside className={`sidebar${open ? " open" : ""}`}>{children}</aside>
    </>
  );
}
