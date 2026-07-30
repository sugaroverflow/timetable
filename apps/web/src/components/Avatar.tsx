// The palette lives in tokens.css (--avatar-1…8); the hash picks a slot.
const COLOR_COUNT = 8;

function colorFor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  return `var(--avatar-${(Math.abs(hash) % COLOR_COUNT) + 1})`;
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
  image,
  small = false,
  large = false,
  xlarge = false,
}: {
  name: string | null;
  image?: string | null;
  small?: boolean;
  large?: boolean;
  xlarge?: boolean;
}) {
  const label = name ?? "?";
  const sizeClass = small
    ? " avatar-sm"
    : xlarge
      ? " avatar-xl"
      : large
        ? " avatar-lg"
        : "";
  if (image) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        className={`avatar avatar-img${sizeClass}`}
        src={image}
        alt={label}
        title={label}
      />
    );
  }
  return (
    <span
      className={`avatar${sizeClass}`}
      style={{ background: colorFor(label) }}
      title={label}
    >
      {initials(label)}
    </span>
  );
}
