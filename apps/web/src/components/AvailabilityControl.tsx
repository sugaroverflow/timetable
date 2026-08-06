"use client";

import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup } from "@base-ui/react/toggle-group";

import { useGqlAction } from "@/lib/useGqlAction";

/** One aliased setAvailability call per slot — a grouped row (same time,
 * several locations) broadcasts the answer to every member, since the
 * elector is answering the TIME (multi-location grouping, 2026-08-06). */
function buildMutation(count: number): string {
  const params = Array.from({ length: count }, (_, i) => `$s${i}: String!`);
  const calls = Array.from(
    { length: count },
    (_, i) => `a${i}: setAvailability(slotId: $s${i}, state: $state)`,
  );
  return `mutation($state: String!, ${params.join(", ")}) { ${calls.join(" ")} }`;
}

const STATES: {
  value: string;
  label: string;
  emoji: string;
  onClass: string;
}[] = [
  { value: "green", label: "Available", emoji: "🟢", onClass: "on-g" },
  { value: "yellow", label: "Maybe", emoji: "🟡", onClass: "on-y" },
  { value: "red", label: "Can’t", emoji: "🔴", onClass: "on-r" },
];

export function AvailabilityControl({
  slotIds,
  state,
  compact = false,
}: {
  /** The slot — or every slot of a grouped row — the answer applies to. */
  slotIds: string[];
  state: string | null;
  /** Emoji-only segments for table cells (calendar table, QA 2026-07-31). */
  compact?: boolean;
}) {
  const { run, busy } = useGqlAction();

  function set(value: string) {
    const vars: Record<string, string> = { state: value };
    slotIds.forEach((id, i) => {
      vars[`s${i}`] = id;
    });
    void run(buildMutation(slotIds.length), vars, {
      errorFallback: "Could not set availability",
    });
  }

  // Unsaved availability counts as "maybe" server-side, so reflect that here.
  const effective = state ?? "yellow";

  return (
    <ToggleGroup
      className={`avseg${compact ? " avseg-compact" : ""}`}
      value={[effective]}
      onValueChange={(groupValue) => {
        // Controlled + always-one-selected: ignore a deselect (empty array);
        // the controlled value keeps the current segment lit.
        const v = groupValue[0];
        if (typeof v === "string" && v !== effective) set(v);
      }}
      aria-label="Your availability"
    >
      {STATES.map((s) => (
        <Toggle
          key={s.value}
          value={s.value}
          className={effective === s.value ? s.onClass : ""}
          disabled={busy}
          aria-label={s.label}
          title={s.label}
        >
          {compact ? s.emoji : s.label}
        </Toggle>
      ))}
    </ToggleGroup>
  );
}
