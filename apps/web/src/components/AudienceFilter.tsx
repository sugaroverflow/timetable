"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import type { TopicOption } from "@/lib/calendarTypes";

export function AudienceFilter({
  value,
  isHost,
  topics,
}: {
  value: string;
  isHost: boolean;
  topics: TopicOption[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function change(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (next && next !== "all") params.set("audience", next);
    else params.delete("audience");
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <select
      aria-label="Audience"
      value={value}
      onChange={(e) => change(e.target.value)}
    >
      <option value="all">All electors</option>
      {isHost ? <option value="hearted_mine">Hearted my topics</option> : null}
      {topics.map((tp) => (
        <option key={tp.id} value={`hearted_topic:${tp.id}`}>
          Hearted: {tp.title}
        </option>
      ))}
    </select>
  );
}
