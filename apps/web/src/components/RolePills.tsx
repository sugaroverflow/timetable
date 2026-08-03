import { primaryRole, type Role } from "@timetable/shared";

import { roleLabel, type RoleLabels } from "@/lib/timetableSettings";

/** The author's single highest role as a small inline pill — the compact
 * treatment comment threads and the activity log share (one pill, 10px;
 * a full "admin host elector" row would drown the name). Nothing renders
 * for ex-members (no roles). */
export function PrimaryRolePill({
  roles,
  labels,
}: {
  roles: readonly string[];
  labels?: RoleLabels;
}) {
  if (roles.length === 0) return null;
  const role = primaryRole(roles as readonly Role[]);
  return (
    <span
      className={`pill pill-${role}`}
      style={{ marginLeft: 6, fontSize: 10 }}
    >
      {roleLabel(labels, role)}
    </span>
  );
}

export function RolePills({
  roles,
  labels,
}: {
  roles: readonly string[];
  labels?: RoleLabels;
}) {
  if (!roles.length) {
    return <span className="pill">No roles</span>;
  }
  return (
    <span className="row wrap">
      {roles.map((role) => (
        <span key={role} className={`pill pill-${role}`}>
          {roleLabel(labels, role)}
        </span>
      ))}
    </span>
  );
}
