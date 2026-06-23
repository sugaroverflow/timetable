"use client";

import { useRouter } from "next/navigation";

export function TimetableSwitcher({
  current,
  options,
}: {
  current: string;
  options: { slug: string; name: string }[];
}) {
  const router = useRouter();
  return (
    <select
      aria-label="Switch timetable"
      value={current}
      onChange={(e) => router.push(`/t/${e.target.value}`)}
      style={{ maxWidth: 280 }}
    >
      {options.map((o) => (
        <option key={o.slug} value={o.slug}>
          {o.name}
        </option>
      ))}
    </select>
  );
}
