"use client";

import { useState } from "react";

import { MemberRolesEditor } from "@/components/MemberRolesEditor";

type Member = {
  membershipId: string;
  userId: string;
  name: string | null;
  email: string | null;
  roles: string[];
};

type Props = {
  slug: string;
  members: Member[];
  roleLabels?: { admin?: string; host?: string; elector?: string };
};

function displayName(m: Member): string {
  return m.name ?? m.email ?? "Unknown";
}

export function MemberRolesPicker({ slug, members, roleLabels }: Props) {
  const sorted = [...members].sort((a, b) =>
    displayName(a).localeCompare(displayName(b)),
  );

  const [selectedId, setSelectedId] = useState<string>(
    sorted[0]?.membershipId ?? "",
  );

  const selected = sorted.find((m) => m.membershipId === selectedId) ?? sorted[0];

  return (
    <div className="card">
      <div className="stack">
        <label className="field">
          Member
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
          >
            {sorted.map((m) => (
              <option key={m.membershipId} value={m.membershipId}>
                {displayName(m)}
              </option>
            ))}
          </select>
        </label>

        {selected ? (
          <ul className="list" style={{ marginTop: 12 }}>
            <MemberRolesEditor
              key={selected.membershipId}
              membershipId={selected.membershipId}
              userId={selected.userId}
              slug={slug}
              name={selected.name}
              email={selected.email}
              roles={selected.roles}
              roleLabels={roleLabels}
            />
          </ul>
        ) : null}
      </div>
    </div>
  );
}
