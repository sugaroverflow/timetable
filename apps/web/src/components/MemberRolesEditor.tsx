"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { clientApi } from "@/lib/clientApi";

const ASSIGNABLE = ["admin", "host", "elector"] as const;
type AssignableRole = (typeof ASSIGNABLE)[number];

const PILL_CLASS: Record<AssignableRole, string> = {
  admin: "pill-admin",
  host: "pill-host",
  elector: "pill-elector",
};

const DEFAULT_LABEL: Record<AssignableRole, string> = {
  admin: "Admin",
  host: "Host",
  elector: "Elector",
};

export function MemberRolesEditor({
  membershipId,
  name,
  email,
  roles: initialRoles,
  roleLabels,
}: {
  membershipId: string;
  name: string | null;
  email: string | null;
  roles: string[];
  roleLabels?: { admin?: string; host?: string; elector?: string };
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
        {ASSIGNABLE.map((role) => {
          const active = roles.includes(role);
          const locked = isOwner && role === "admin";
          const customLabel = roleLabels?.[role];
          const displayLabel = customLabel ?? DEFAULT_LABEL[role];
          const titleAttr = customLabel ? role : undefined;

          return (
            <button
              key={role}
              type="button"
              className={`pill${active ? ` ${PILL_CLASS[role]}` : ""}`}
              style={{
                cursor: locked ? "not-allowed" : "pointer",
                opacity: locked ? 0.6 : 1,
                border: undefined,
                font: "inherit",
              }}
              onClick={() => !locked && toggleRole(role)}
              disabled={locked}
              title={titleAttr}
              aria-pressed={active}
            >
              {displayLabel}
              {active ? " ✓" : ""}
            </button>
          );
        })}
        <button className="btn" type="button" onClick={save} disabled={busy}>
          {busy ? "Saving…" : saved ? "Saved" : "Save"}
        </button>
      </div>
    </li>
  );
}
