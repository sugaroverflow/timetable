"use client";

import { SelectMinimal } from "@/components/SelectMinimal";
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
    <SelectMinimal
      aria-label="Topic lens"
      value={value}
      onChange={(e) => {
        // "all" is the default: it rides as no param at all.
        const next = e.target.value;
        setParam("audience", next === "all" ? "" : next);
      }}
    >
      <option value="all">All electors</option>
      {isHost ? <option value="hearted_mine">❤️ my topics</option> : null}
      {topics.map((tp) => (
        <option key={tp.id} value={`hearted_topic:${tp.id}`}>
          ❤️ {tp.title}
        </option>
      ))}
    </SelectMinimal>
  );
}
