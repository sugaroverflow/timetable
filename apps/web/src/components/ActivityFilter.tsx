"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { ACTION_LABELS } from "@/lib/activityLabels";

export function ActivityFilter({
  value,
  actions,
}: {
  value: string;
  actions: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function change(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (next) params.set("action", next);
    else params.delete("action");
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <>
      <label htmlFor="activity-filter">Action</label>
      <select
        id="activity-filter"
        aria-label="Filter by action type"
        value={value}
        onChange={(e) => change(e.target.value)}
      >
        <option value="">All actions</option>
        {actions.map((action) => (
          <option key={action} value={action}>
            {ACTION_LABELS[action] ?? action}
          </option>
        ))}
      </select>
    </>
  );
}
