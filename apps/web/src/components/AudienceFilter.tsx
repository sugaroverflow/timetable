"use client";

import type { TopicOption } from "@/lib/calendarTypes";
import { useSetSearchParam } from "@/lib/useSearchParamNav";

export function AudienceFilter({
  value,
  isHost,
  topics,
}: {
  value: string;
  isHost: boolean;
  topics: TopicOption[];
}) {
  const setParam = useSetSearchParam();

  return (
    <select
      aria-label="Audience"
      value={value}
      onChange={(e) => {
        // "all" is the default: it rides as no param at all.
        const next = e.target.value;
        setParam("audience", next === "all" ? "" : next);
      }}
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
