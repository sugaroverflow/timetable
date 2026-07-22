"use client";

import { ASSIGNABLE_ROLES } from "@timetable/shared";

import { roleLabel, type RoleLabels } from "@/lib/timetableSettings";

/**
 * Checkbox group over the assignable roles, shared by InviteForm and
 * AddPersonForm. The two variants keep each form's original rendering:
 * "pill" (InviteForm) shows pill checkboxes with raw role names; "inline"
 * (AddPersonForm) shows plain checkboxes with the forum's role labels.
 */
export function RoleCheckboxGroup({
  value,
  onChange,
  roleLabels,
  variant = "pill",
}: {
  value: string[];
  onChange: (roles: string[]) => void;
  roleLabels?: RoleLabels;
  variant?: "pill" | "inline";
}) {
  function toggleRole(role: string) {
    onChange(
      value.includes(role) ? value.filter((r) => r !== role) : [...value, role],
    );
  }

  if (variant === "inline") {
    return (
      <div className="row" style={{ gap: 12 }}>
        {ASSIGNABLE_ROLES.map((role) => (
          <label
            key={role}
            className="row"
            style={{ gap: 5, alignItems: "center", fontSize: 13 }}
          >
            <input
              type="checkbox"
              checked={value.includes(role)}
              onChange={() => toggleRole(role)}
              style={{ width: "auto" }}
            />
            {roleLabel(roleLabels, role)}
          </label>
        ))}
      </div>
    );
  }

  return (
    <div className="row wrap">
      {ASSIGNABLE_ROLES.map((role) => (
        <label key={role} className="pill" style={{ cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={value.includes(role)}
            onChange={() => toggleRole(role)}
            style={{ width: "auto", marginRight: 6 }}
          />
          {role}
        </label>
      ))}
    </div>
  );
}
