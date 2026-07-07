"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { privacyBadge } from "@/lib/timetableSettings";

export type SwitcherItem = {
  slug: string;
  name: string;
  iconUrl: string | null;
  privacy: string;
};

function ItemIcon({ item }: { item: SwitcherItem }) {
  if (item.iconUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className="tt-menu-icon" src={item.iconUrl} alt="" />;
  }
  return (
    <span className="tt-menu-icon tt-menu-icon-fallback" aria-hidden>
      {item.name.slice(0, 1).toUpperCase()}
    </span>
  );
}

/**
 * Timetable switcher in the sidebar footer (QA #59 — moved out of the
 * topbar, cf. the account switcher in Twitter's sidebar). Each entry shows
 * the timetable's icon, name, and visibility; the menu opens upward and
 * ends with "New timetable". Selecting one always lands on its feed.
 */
export function TimetableSwitcher({
  items,
  currentSlug,
}: {
  items: SwitcherItem[];
  currentSlug: string;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const current = items.find((i) => i.slug === currentSlug) ?? null;

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Close after navigation — state adjustment during render (not an
  // effect), per react-hooks/set-state-in-effect.
  const [lastPathname, setLastPathname] = useState(pathname);
  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    setOpen(false);
  }

  return (
    <div className="tt-switcher" ref={rootRef}>
      {open ? (
        <div className="tt-switcher-list" role="menu">
          {items.map((item) => {
            const privacy = privacyBadge(item.privacy);
            return (
              <Link
                key={item.slug}
                role="menuitem"
                className={`tt-menu-item${
                  item.slug === currentSlug ? " tt-menu-item-current" : ""
                }`}
                href={`/t/${item.slug}/feed`}
              >
                <ItemIcon item={item} />
                <span>
                  {item.name}
                  <span className="tt-switcher-privacy">
                    <span
                      className="privacy-dot"
                      style={{ background: privacy.dot }}
                    />
                    {privacy.label}
                  </span>
                </span>
              </Link>
            );
          })}
          <Link
            role="menuitem"
            className="tt-menu-item tt-menu-new"
            href="/timetables/new"
          >
            <span className="tt-menu-icon tt-menu-icon-fallback" aria-hidden>
              ＋
            </span>
            <span>New timetable</span>
          </Link>
        </div>
      ) : null}
      <button
        type="button"
        className="tt-switcher-trigger"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
      >
        {current ? <ItemIcon item={current} /> : null}
        <span className="tt-menu-name">
          {current?.name ?? "Timetables"}
          <span className="tt-switcher-hint">Switch timetable</span>
        </span>
        <span aria-hidden style={{ fontSize: 10 }}>
          ⇅
        </span>
      </button>
    </div>
  );
}
