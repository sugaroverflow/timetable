"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * Sidebar nav link with active-state highlighting. Query-aware (QA
 * 2026-07-28): an href carrying search params (❤️ Topics at
 * `/topics?hearted=me`) is active only when those params match, and a
 * plain href can demand params be absent via `whenAbsent` — so All Topics
 * and ❤️ Topics never light up together.
 */
export function NavLink({
  href,
  exact = false,
  whenAbsent = [],
  children,
}: {
  href: string;
  exact?: boolean;
  /** Param names that must NOT be in the URL for this link to be active. */
  whenAbsent?: string[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const search = useSearchParams();

  const [hrefPath = "", hrefQuery] = href.split("?");
  let active = exact ? pathname === hrefPath : pathname.startsWith(hrefPath);
  if (active && hrefQuery) {
    const wanted = new URLSearchParams(hrefQuery);
    active = [...wanted.entries()].every(([k, v]) => search.get(k) === v);
  }
  if (active && whenAbsent.some((k) => search.has(k))) active = false;

  return (
    <Link href={href} className={active ? "on" : undefined}>
      {children}
    </Link>
  );
}
