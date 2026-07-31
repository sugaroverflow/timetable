"use client";

import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup } from "@base-ui/react/toggle-group";

import { useGqlAction } from "@/lib/useGqlAction";

const MUTATION = `mutation($id: String!, $state: String!) {
  setAvailability(slotId: $id, state: $state)
}`;

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
  slotId,
  state,
  compact = false,
}: {
  slotId: string;
  state: string | null;
  /** Emoji-only segments for table cells (calendar table, QA 2026-07-31). */
  compact?: boolean;
}) {
  const { run, busy } = useGqlAction();

  function set(value: string) {
    void run(
      MUTATION,
      { id: slotId, state: value },
      { errorFallback: "Could not set availability" },
    );
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
