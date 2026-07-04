"use client";

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
    <span className="avseg">
      {STATES.map((s) => (
        <button
          key={s.value}
          type="button"
          className={effective === s.value ? s.onClass : ""}
          disabled={pending}
          onClick={() => set(s.value)}
          aria-pressed={effective === s.value}
        >
          {s.label}
        </button>
      ))}
    </span>
  );
}
