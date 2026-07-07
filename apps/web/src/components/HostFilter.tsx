"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

export function HostFilter({
  value,
  hosts,
  allLabel = "All hosts",
}: {
  value: string;
  hosts: { id: string; name: string | null }[];
  allLabel?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function change(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (next) params.set("host", next);
    else params.delete("host");
    params.delete("page");
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <select
      aria-label="Filter by host"
      value={value}
      onChange={(e) => change(e.target.value)}
    >
      <option value="">{allLabel}</option>
      {hosts.map((h) => (
        <option key={h.id} value={h.id}>
          {h.name ?? "Host"}
        </option>
      ))}
    </select>
  );
}
