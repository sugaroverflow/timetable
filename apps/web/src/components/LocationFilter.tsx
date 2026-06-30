"use client";
import { useRouter, useSearchParams } from "next/navigation";

export function LocationFilter({
  value,
  locations,
}: {
  value: string;
  locations: string[];
}) {
  const router = useRouter();
  const params = useSearchParams();

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const p = new URLSearchParams(params.toString());
    if (e.target.value) {
      p.set("location", e.target.value);
    } else {
      p.delete("location");
    }
    router.push(`?${p.toString()}`);
  }

  return (
    <select value={value} onChange={onChange} aria-label="Filter by location">
      <option value="">All locations</option>
      {locations.map((loc) => (
        <option key={loc} value={loc}>{loc}</option>
      ))}
    </select>
  );
}
