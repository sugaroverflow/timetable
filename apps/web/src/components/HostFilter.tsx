"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

export function HostFilter({
  value,
  hosts,
}: {
  value: string;
  hosts: { id: string; name: string | null }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function change(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (next) params.set("host", next);
    else params.delete("host");
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <select
      aria-label="Filter by host"
      value={value}
      onChange={(e) => change(e.target.value)}
    >
      <option value="">All hosts</option>
      {hosts.map((h) => (
        <option key={h.id} value={h.id}>
          {h.name ?? "Host"}
        </option>
      ))}
    </select>
  );
}
