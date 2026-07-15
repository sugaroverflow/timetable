"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { clientGql } from "@/lib/clientGraphql";
import { parseTimetableSettings } from "@/lib/timetableSettings";

export type BrandItem = {
  slug: string;
  name: string;
  iconUrl: string | null;
  iconEmoji?: string | null;
};

const PUBLIC_BRAND_QUERY = `
  query TopbarBrand($s: String!) {
    timetable(idOrSlug: $s) { name settings }
  }
`;

/**
 * Topbar identity (QA #59): inside a timetable the topbar shows only that
 * timetable's icon + name (linking home to its feed) — the app logotype and
 * switcher are gone (switching lives in the sidebar footer). Signed-in
 * viewers get the identity from their membership list; anonymous visitors
 * on a public timetable resolve it client-side (QA #59 round 3). Outside a
 * timetable it falls back to the app brand.
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
  const [fetched, setFetched] = useState<BrandItem | null>(null);
  const listed = items.find((i) => i.slug === currentSlug) ?? null;
  const current =
    listed ?? (fetched && fetched.slug === currentSlug ? fetched : null);

  useEffect(() => {
    if (!currentSlug || listed) return;
    let cancelled = false;
    clientGql<{ timetable: { name: string; settings: string } | null }>(
      PUBLIC_BRAND_QUERY,
      { s: currentSlug },
    )
      .then((data) => {
        if (cancelled || !data.timetable) return;
        const parsed = parseTimetableSettings(data.timetable.settings);
        setFetched({
          slug: currentSlug,
          name: data.timetable.name,
          iconUrl: parsed.iconUrl ?? null,
          iconEmoji: parsed.iconEmoji ?? null,
        });
      })
      .catch(() => {
        // Not readable (private) or transient failure — keep the app brand.
      });
    return () => {
      cancelled = true;
    };
  }, [currentSlug, listed]);

  if (current) {
    return (
      <Link className="brand" href={`/t/${current.slug}/feed`}>
        {current.iconEmoji ? (
          <span className="tt-menu-icon tt-menu-icon-emoji" aria-hidden>
            {current.iconEmoji}
          </span>
        ) : current.iconUrl ? (
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
