"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import { clientGql } from "@/lib/clientGraphql";

const MUTATION = `mutation($s: String!){ markNotificationsSeen(idOrSlug: $s) }`;

/** Resets the notifications badge when the pane is opened (QA #59), then
 * refreshes so the sidebar count clears. */
export function MarkNotificationsSeen({ slug }: { slug: string }) {
  const router = useRouter();
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    clientGql(MUTATION, { s: slug })
      .then(() => router.refresh())
      .catch(() => {
        // Non-fatal: the badge just stays until the next visit.
      });
  }, [slug, router]);
  return null;
}
