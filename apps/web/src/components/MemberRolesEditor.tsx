"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { clientApi } from "@/lib/clientApi";

const ASSIGNABLE = ["admin", "host", "elector"] as const;

export function MemberRolesEditor({
  membershipId,
  name,
  email,
  roles: initialRoles,
}: {
  membershipId: string;
  name: string | null;
  email: string | null;
  roles: string[];
}) {
  const router = useRouter();
  const isOwner = initialRoles.includes("owner");
  const [roles, setRoles] = useState<string[]>(initialRoles);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  function toggleRole(role: string) {
    setSaved(false);
    setRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role],
    );
  }

  async function save() {
    setBusy(true);
    setSaved(false);
    const res = await clientApi(`/api/memberships/${membershipId}/roles`, {
      method: "PATCH",
      body: JSON.stringify({
        roles: roles.filter((r) => r !== "owner"),
      }),
    });
    setBusy(false);
    if (res.ok) {
      setSaved(true);
      router.refresh();
    }
  }

  return (
    <li className="card">
      <div className="row wrap" style={{ justifyContent: "space-between" }}>
        <div>
          <strong>{name ?? email ?? "Unknown user"}</strong>
          {email ? (
            <div className="faint" style={{ fontSize: 12 }}>
              {email}
            </div>
          ) : null}
        </div>
        {isOwner ? <span className="pill pill-owner">Owner</span> : null}
      </div>

      <div className="row wrap" style={{ marginTop: 10 }}>
        {ASSIGNABLE.map((role) => (
          <label key={role} className="pill" style={{ cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={roles.includes(role)}
              onChange={() => toggleRole(role)}
              disabled={isOwner && role === "admin"}
              style={{ width: "auto", marginRight: 6 }}
            />
            {role}
          </label>
        ))}
        <button className="btn" type="button" onClick={save} disabled={busy}>
          {busy ? "Saving…" : saved ? "Saved" : "Save"}
        </button>
      </div>
    </li>
  );
}
