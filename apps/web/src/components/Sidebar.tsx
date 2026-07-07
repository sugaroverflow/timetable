"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

/** Left navigation rail (QA #42): always visible on desktop, collapsed
 * behind a menu button on mobile. Closes itself after navigation. */
export function Sidebar({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

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
