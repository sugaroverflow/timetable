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
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span
        className="faint"
        style={{
          fontSize: 10,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
        }}
      >
        Timetable
      </span>
      <select
        aria-label="Switch timetable"
        value={current}
        onChange={(e) => router.push(`/t/${e.target.value}`)}
        style={{ maxWidth: 220, fontWeight: 600, fontSize: 14 }}
      >
        {options.map((o) => (
          <option key={o.slug} value={o.slug}>
            {o.name}
          </option>
        ))}
      </select>
    </div>
  );
}
