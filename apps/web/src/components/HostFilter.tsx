"use client";

import { SelectMinimal } from "@/components/SelectMinimal";
import { useSetSearchParam } from "@/lib/useSearchParamNav";

export function HostFilter({
  value,
  hosts,
  allLabel = "All hosts",
  param = "host",
}: {
  value: string;
  hosts: { id: string; name: string | null }[];
  allLabel?: string;
  /** Search param this filter rides on — lets two independent host filters
   * coexist on one page (Analysis, QA 2026-07-27). */
  param?: string;
}) {
  const setParam = useSetSearchParam();

  return (
    <SelectMinimal
      aria-label="Filter by host"
      value={value}
      onChange={(e) => setParam(param, e.target.value, { resetPage: true })}
    >
      <option value="">{allLabel}</option>
      {hosts.map((h) => (
        <option key={h.id} value={h.id}>
          {h.name ?? "Host"}
        </option>
      ))}
    </SelectMinimal>
  );
}
