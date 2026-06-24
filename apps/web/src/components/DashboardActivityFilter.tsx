"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

const OPTIONS = [
  { value: "all", label: "All electors" },
  { value: "active", label: "Any activity" },
  { value: "quiet", label: "No activity" },
  { value: "no_hearts", label: "No hearts" },
  { value: "no_comments", label: "No comments" },
  { value: "no_availability", label: "No availability" },
];

export function DashboardActivityFilter({ value }: { value: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function change(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "all") params.delete("activity");
    else params.set("activity", next);
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  return (
    <select
      aria-label="Filter elector activity"
      value={value}
      onChange={(e) => change(e.target.value)}
    >
      {OPTIONS.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
