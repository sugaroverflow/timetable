"use client";

import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup } from "@base-ui/react/toggle-group";
import { useTransition } from "react";
import { useRouter } from "next/navigation";

import { useToast } from "@/components/Toast";
import { clientGql } from "@/lib/clientGraphql";

const MUTATION = `mutation($id: String!, $state: String!) {
  setAvailability(slotId: $id, state: $state)
}`;

const STATES: { value: string; label: string; onClass: string }[] = [
  { value: "green", label: "Available", onClass: "on-g" },
  { value: "yellow", label: "Maybe", onClass: "on-y" },
  { value: "red", label: "Can’t", onClass: "on-r" },
];

export function AvailabilityControl({
  slotId,
  state,
}: {
  slotId: string;
  state: string | null;
}) {
  const router = useRouter();
  const { toastError } = useToast();
  const [pending, startTransition] = useTransition();

  async function set(value: string) {
    try {
      await clientGql(MUTATION, { id: slotId, state: value });
      startTransition(() => router.refresh());
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Could not set availability");
    }
  }

  // Unsaved availability counts as "maybe" server-side, so reflect that here.
  const effective = state ?? "yellow";

  return (
    <ToggleGroup
      className="avseg"
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
          disabled={pending}
        >
          {s.label}
        </Toggle>
      ))}
    </ToggleGroup>
  );
}
