"use client";

import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";

import { clientGql } from "@/lib/clientGraphql";

const MUTATION = `mutation($id: String!){ markDigestRead(sendId: $id) }`;

/** Watches every app page for a `?dg=<send id>` param — digest emails
 * stamp it on all their links (2026-08-13). One click anywhere proves the
 * email was read, so the API marks that digest's shown comment threads
 * seen up to its send time. Fire-and-forget, then the param is stripped
 * so refreshes and copied links don't re-fire. */
export function DigestReadMarker() {
  const searchParams = useSearchParams();
  const dg = searchParams.get("dg");
  const sent = useRef<string | null>(null);

  useEffect(() => {
    if (!dg || sent.current === dg) return;
    sent.current = dg;
    clientGql(MUTATION, { id: dg }).catch(() => {
      // Non-fatal (e.g. landed signed-out): the threads just stay unread.
    });
    const url = new URL(window.location.href);
    url.searchParams.delete("dg");
    window.history.replaceState(null, "", url.toString());
  }, [dg]);

  return null;
}
