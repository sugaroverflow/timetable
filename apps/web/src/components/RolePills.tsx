const LABELS: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  host: "Host",
  elector: "Elector",
};

export function RolePills({ roles }: { roles: readonly string[] }) {
  if (!roles.length) {
    return <span className="pill">No roles</span>;
  }
  return (
    <span className="row wrap">
      {roles.map((role) => (
        <span key={role} className={`pill pill-${role}`}>
          {LABELS[role] ?? role}
        </span>
      ))}
    </span>
  );
}
