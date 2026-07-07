"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

/** Start/end date pickers for the activity log (QA #59). Values ride in
 * the URL so the server filters the query. */
export function ActivityDateFilter({
  from,
  to,
}: {
  from: string;
  to: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function change(key: "from" | "to", value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <>
      <label htmlFor="activity-from">From</label>
      <input
        id="activity-from"
        type="date"
        value={from}
        max={to || undefined}
        onChange={(e) => change("from", e.target.value)}
      />
      <label htmlFor="activity-to">To</label>
      <input
        id="activity-to"
        type="date"
        value={to}
        min={from || undefined}
        onChange={(e) => change("to", e.target.value)}
      />
    </>
  );
}
