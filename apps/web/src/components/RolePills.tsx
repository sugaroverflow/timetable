import { roleLabel, type RoleLabels } from "@/lib/timetableSettings";

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
