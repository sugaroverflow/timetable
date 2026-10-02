import { avatarSlot, initials } from "@timetable/shared";

// The palette lives in tokens.css (--avatar-1…8); the shared hash picks
// the slot, so email avatars (which index a literal palette) match.
function colorFor(seed: string): string {
  return `var(--avatar-${avatarSlot(seed) + 1})`;
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
