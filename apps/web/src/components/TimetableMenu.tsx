"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export type TimetableMenuItem = {
  slug: string;
  name: string;
  iconUrl: string | null;
};

function ItemIcon({ item }: { item: TimetableMenuItem }) {
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
 * Airtable-style timetable switcher in the global topbar (QA #42). The
 * trigger shows the current timetable (doubling as "home" — it links back
 * to the feed); the menu lists every timetable and ends with "New
 * timetable". Selecting one always lands on its feed.
 */
export function TimetableMenu({ items }: { items: TimetableMenuItem[] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const currentSlug = /^\/t\/([^/]+)/.exec(pathname ?? "")?.[1] ?? null;
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

  // Close when navigating.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <div className="tt-menu" ref={rootRef}>
      <button
        type="button"
        className="tt-menu-trigger"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
      >
        {current ? (
          <>
            <ItemIcon item={current} />
            <span className="tt-menu-name">{current.name}</span>
          </>
        ) : (
          <span className="tt-menu-name">Timetables</span>
        )}
        <span aria-hidden style={{ fontSize: 10 }}>
          ▾
        </span>
      </button>
      {open ? (
        <div className="tt-menu-list" role="menu">
          {current ? (
            <Link
              role="menuitem"
              className="tt-menu-item"
              href={`/t/${current.slug}/feed`}
            >
              <ItemIcon item={current} />
              <span>
                {current.name}
                <span className="faint" style={{ display: "block", fontSize: 11 }}>
                  Go to topic feed
                </span>
              </span>
            </Link>
          ) : null}
          {items
            .filter((i) => i.slug !== currentSlug)
            .map((item) => (
              <Link
                key={item.slug}
                role="menuitem"
                className="tt-menu-item"
                href={`/t/${item.slug}/feed`}
              >
                <ItemIcon item={item} />
                <span>{item.name}</span>
              </Link>
            ))}
          <Link role="menuitem" className="tt-menu-item tt-menu-new" href="/timetables/new">
            <span className="tt-menu-icon tt-menu-icon-fallback" aria-hidden>
              ＋
            </span>
            <span>New timetable</span>
          </Link>
        </div>
      ) : null}
    </div>
  );
}
