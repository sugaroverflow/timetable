"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

import { useToast } from "@/components/Toast";
import { clientGql } from "@/lib/clientGraphql";

const MUTATION = `mutation($id: String!, $state: String!) {
  setAvailability(slotId: $id, state: $state)
}`;

const STATES: { value: string; icon: string }[] = [
  { value: "green", icon: "\uD83D\uDFE2" },
  { value: "yellow", icon: "\uD83D\uDFE1" },
  { value: "red", icon: "\uD83D\uDD34" },
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

  return (
    <span className="avail-btns">
      {STATES.map((s) => (
        <button
          key={s.value}
          type="button"
          className={`avail-btn ${s.value} ${state === s.value ? "on" : ""}`}
          disabled={pending}
          onClick={() => set(s.value)}
          aria-label={s.value}
        >
          {s.icon}
        </button>
      ))}
    </span>
  );
}
