import Link from "next/link";

import { personPath } from "@/lib/personPath";

/** Wraps a user's name/avatar anywhere in the app; clicking goes straight
 * to their person page (QA 2026-07-27 — the bio modal step is gone). Links
 * by userId: the person page canonically redirects to the member's slug
 * URL, so callers don't need to know it. */
export function PersonChip({
  slug,
  userId,
  children,
}: {
  slug: string;
  userId: string;
  children: React.ReactNode;
}) {
  return (
    <Link href={personPath(slug, userId)} className="person-trigger">
      {children}
    </Link>
  );
}
