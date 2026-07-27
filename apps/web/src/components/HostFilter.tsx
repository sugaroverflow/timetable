"use client";

import { ChevronDown } from "lucide-react";

import { useSetSearchParam } from "@/lib/useSearchParamNav";

export function HostFilter({
  value,
  hosts,
  allLabel = "All hosts",
}: {
  value: string;
  hosts: { id: string; name: string | null }[];
  allLabel?: string;
}) {
  const setParam = useSetSearchParam();

  return (
    <span className="select-minimal">
      <ChevronDown size={14} aria-hidden />
      <select
        aria-label="Filter by host"
        value={value}
        onChange={(e) => setParam("host", e.target.value, { resetPage: true })}
      >
        <option value="">{allLabel}</option>
        {hosts.map((h) => (
          <option key={h.id} value={h.id}>
            {h.name ?? "Host"}
          </option>
        ))}
      </select>
    </span>
  );
}
