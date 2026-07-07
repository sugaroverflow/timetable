"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

export function ActorFilter({
  value,
  actors,
}: {
  value: string;
  actors: { id: string; name: string | null }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function change(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (next) params.set("actor", next);
    else params.delete("actor");
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <>
      <label htmlFor="actor-filter">User</label>
      <select
        id="actor-filter"
        aria-label="Filter by user"
        value={value}
        onChange={(e) => change(e.target.value)}
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
