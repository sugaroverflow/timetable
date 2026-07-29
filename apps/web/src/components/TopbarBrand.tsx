"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { clientGql } from "@/lib/clientGraphql";
import { parseTimetableSettings } from "@/lib/timetableSettings";

export type BrandItem = {
  slug: string;
  name: string;
  iconUrl: string | null;
  /** Dark-mode alternative (2026-07-29); falls back to iconUrl. */
  iconDarkUrl?: string | null;
  iconEmoji?: string | null;
};

const PUBLIC_BRAND_QUERY = `
  query TopbarBrand($s: String!) {
    timetable: forum(idOrSlug: $s) { name settings }
  }
`;

function BrandIcon({ item }: { item: BrandItem }) {
  if (item.iconEmoji) {
    return (
      <span className="tt-menu-icon tt-menu-icon-emoji" aria-hidden>
        {item.iconEmoji}
      </span>
    );
  }
  if (item.iconUrl) {
    // Both mode variants render; CSS shows the html[data-theme] match.
    return (
      <>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className={`tt-menu-icon${item.iconDarkUrl ? " mode-light-only" : ""}`}
          src={item.iconUrl}
          alt=""
        />
        {item.iconDarkUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            className="tt-menu-icon mode-dark-only"
            src={item.iconDarkUrl}
            alt=""
          />
        ) : null}
      </>
    );
  }
  return (
    <span className="tt-menu-icon tt-menu-icon-fallback" aria-hidden>
      {item.name.slice(0, 1).toUpperCase()}
    </span>
  );
}

/**
 * Topbar identity (QA #59): inside a timetable the topbar shows that
 * timetable's icon + name on the left (linking home to its topics) — the
 * app logotype and switcher are gone (switching lives in the sidebar
 * footer). Long names wrap to two lines rather than truncate (QA
 * 2026-07-27 — truncating the forum's own name reads as an insult).
 * Signed-in viewers get the identity from their membership list; anonymous
 * visitors on a public timetable resolve it client-side (QA #59 round 3).
 * Outside a timetable it falls back to the app brand.
 */
export function TopbarBrand({
  items,
  fallbackHref = "/",
}: {
  items: BrandItem[];
  fallbackHref?: string;
}) {
  const pathname = usePathname();
  const currentSlug = /^\/f\/([^/]+)/.exec(pathname ?? "")?.[1] ?? null;
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
          iconDarkUrl: parsed.iconDarkUrl ?? null,
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
      <Link className="brand" href={`/f/${current.slug}/topics`}>
        <BrandIcon item={current} />
        <span>{current.name}</span>
      </Link>
    );
  }

  return (
    <Link className="brand" href={fallbackHref}>
      <span className="brand-logo" aria-hidden>
        📚
      </span>
      <span>Topic</span>
    </Link>
  );
}
