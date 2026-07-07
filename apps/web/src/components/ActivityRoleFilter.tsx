"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

/** Filter activity entries by the actor's role (QA #59). */
export function ActivityRoleFilter({
  value,
  options,
}: {
  value: string;
  options: { role: string; label: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function change(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (next) params.set("role", next);
    else params.delete("role");
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <>
      <label htmlFor="activity-role">Role</label>
      <select
        id="activity-role"
        aria-label="Filter by actor role"
        value={value}
        onChange={(e) => change(e.target.value)}
      >
        <option value="">All roles</option>
        {options.map((o) => (
          <option key={o.role} value={o.role}>
            {o.label}
          </option>
        ))}
      </select>
    </>
  );
}
