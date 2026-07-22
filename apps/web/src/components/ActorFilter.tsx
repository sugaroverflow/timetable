"use client";

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
    <>
      <label htmlFor="actor-filter">User</label>
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
    </>
  );
}
