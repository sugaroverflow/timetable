"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { NORM_MODES } from "@/lib/normModes";

export function FeedSortControl({ value }: { value: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function change(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("sort", next);
    params.delete("page");
    // Random sort gets a fresh shuffle seed per selection; the seed rides
    // in the URL so infinite-scroll pages stay consistent (QA #59).
    if (next === "random") {
      params.set("seed", Math.random().toString(36).slice(2, 10));
    } else {
      params.delete("seed");
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <select
      aria-label="Sort topics"
      value={value}
      onChange={(e) => change(e.target.value)}
    >
      <option value="random">Random</option>
      <optgroup label="By hearts">
        {NORM_MODES.map((mode) => (
          <option key={mode.key} value={mode.key} title={mode.description}>
            {mode.symbol} — {mode.label}
          </option>
        ))}
      </optgroup>
      <option value="comments">Latest comments</option>
      <option value="recent">Newest</option>
    </select>
  );
}
