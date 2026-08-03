"use client";

import { SelectMinimal } from "@/components/SelectMinimal";
import type { TopicOption } from "@/lib/calendarTypes";
import { useSetSearchParam } from "@/lib/useSearchParamNav";

/** The calendar's topic lens. Hosts see only their own topics (the caller
 * passes them pre-filtered); admins see every topic, grouped by host
 * (QA 2026-08-02). `electorsLabel` is the forum's own (plural) elector
 * role label (QA 2026-08-03). */
export function AudienceFilter({
  value,
  isHost,
  admin,
  topics,
  electorsLabel = "electors",
}: {
  value: string;
  isHost: boolean;
  admin: boolean;
  topics: TopicOption[];
  electorsLabel?: string;
}) {
  const setParam = useSetSearchParam();

  const groups = new Map<string, TopicOption[]>();
  if (admin) {
    for (const topic of topics) {
      const host = topic.hostName ?? "Unknown host";
      groups.set(host, [...(groups.get(host) ?? []), topic]);
    }
  }

  const option = (tp: TopicOption) => (
    <option key={tp.id} value={`hearted_topic:${tp.id}`}>
      {tp.title}
      {tp.heartCount != null ? ` (${tp.heartCount} ❤️s)` : ""}
    </option>
  );

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
      <option value="all">All {electorsLabel}</option>
      {isHost ? <option value="hearted_mine">❤️ my topics</option> : null}
      {admin
        ? [...groups.keys()]
            .sort((a, b) => a.localeCompare(b))
            .map((host) => (
              <optgroup key={host} label={host}>
                {(groups.get(host) ?? []).map(option)}
              </optgroup>
            ))
        : topics.map(option)}
    </SelectMinimal>
  );
}
