export function EmptyState({
  icon,
  title,
  hint,
}: {
  icon: string;
  title: string;
  hint?: string;
}) {
  return (
    <div className="empty">
      <div className="ee" aria-hidden>
        {icon}
      </div>
      <h3>{title}</h3>
      {hint ? <p>{hint}</p> : null}
    </div>
  );
}
