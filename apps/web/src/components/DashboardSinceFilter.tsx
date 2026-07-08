"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

/** Start date for the elector-activity table (QA #59 round 3). Defaults to
 * the hearts cutoff; clearing it falls back to that default. */
export function DashboardSinceFilter({ value }: { value: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function change(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (next) params.set("since", next);
    else params.delete("since");
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <>
      <label htmlFor="dash-since">Since</label>
      <input
        id="dash-since"
        type="date"
        value={value}
        onChange={(e) => change(e.target.value)}
      />
    </>
  );
}
