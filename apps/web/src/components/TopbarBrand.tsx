"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

export type BrandItem = {
  slug: string;
  name: string;
  iconUrl: string | null;
};

/**
 * Topbar identity (QA #59): inside a timetable the topbar shows only that
 * timetable's icon + name (linking home to its feed) — the app logotype and
 * switcher are gone (switching lives in the sidebar footer). Outside a
 * timetable (profile, create screens, signed out) it falls back to the app
 * brand.
 */
export function TopbarBrand({
  items,
  fallbackHref = "/",
}: {
  items: BrandItem[];
  fallbackHref?: string;
}) {
  const pathname = usePathname();
  const currentSlug = /^\/t\/([^/]+)/.exec(pathname ?? "")?.[1] ?? null;
  const current = items.find((i) => i.slug === currentSlug) ?? null;

  if (current) {
    return (
      <Link className="brand" href={`/t/${current.slug}/feed`}>
        {current.iconUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="tt-menu-icon" src={current.iconUrl} alt="" />
        ) : (
          <span className="tt-menu-icon tt-menu-icon-fallback" aria-hidden>
            {current.name.slice(0, 1).toUpperCase()}
          </span>
        )}
        <span>{current.name}</span>
      </Link>
    );
  }

  return (
    <Link className="brand" href={fallbackHref}>
      <Image
        className="brand-logo"
        src="/assets/timetable.love-logo-transparent.png"
        alt=""
        width={30}
        height={30}
        priority
      />
      <span>Timetable</span>
    </Link>
  );
}
