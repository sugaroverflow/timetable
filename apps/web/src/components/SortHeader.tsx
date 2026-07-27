"use client";

/** Sortable `<th>` for the analysis tables — click toggles the column's
 * direction, the active column shows its arrow and sets aria-sort. */
export function SortHeader({
  label,
  active,
  dir,
  onToggle,
}: {
  label: string;
  active: boolean;
  dir: "asc" | "desc";
  onToggle: () => void;
}) {
  return (
    <th
      aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        className={active ? "th-sort th-sort-active" : "th-sort"}
        onClick={onToggle}
      >
        {label}
        <span aria-hidden className="th-sort-arrow">
          {active ? (dir === "asc" ? " ▲" : " ▼") : ""}
        </span>
      </button>
    </th>
  );
}
