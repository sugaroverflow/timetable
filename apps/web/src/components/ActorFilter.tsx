"use client";

import { ChevronDown } from "lucide-react";

import { useSetSearchParam } from "@/lib/useSearchParamNav";

export function ActorFilter({
  value,
  actors,
}: {
  value: string;
  actors: { id: string; name: string | null }[];
}) {
  const setParam = useSetSearchParam();

  return (
    <span className="select-minimal">
      <ChevronDown size={14} aria-hidden />
      <select
        id="actor-filter"
        aria-label="Filter by user"
        value={value}
        onChange={(e) => setParam("actor", e.target.value)}
      >
        <option value="">All users</option>
        {actors.map((actor) => (
          <option key={actor.id} value={actor.id}>
            {actor.name ?? actor.id}
          </option>
        ))}
      </select>
    </span>
  );
}
