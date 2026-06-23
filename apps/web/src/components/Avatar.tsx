const COLORS = [
  "#7048e8",
  "#e8590c",
  "#1098ad",
  "#2f9e44",
  "#c2255c",
  "#3b5bdb",
  "#0c8599",
  "#5f3dc4",
];

function colorFor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  return COLORS[Math.abs(hash) % COLORS.length] ?? COLORS[0]!;
}

function initials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function Avatar({
  name,
  small = false,
}: {
  name: string | null;
  small?: boolean;
}) {
  const label = name ?? "?";
  return (
    <span
      className={small ? "avatar avatar-sm" : "avatar"}
      style={{ background: colorFor(label) }}
      title={label}
    >
      {initials(label)}
    </span>
  );
}
