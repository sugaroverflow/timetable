"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { useToast } from "@/components/Toast";
import { clientGql } from "@/lib/clientGraphql";

export type GqlActionOptions<T> = {
  /** Success toast — a string, or derive one from the mutation data.
   * Omit for actions that succeed silently (hearts, availability). */
  success?: string | ((data: T) => string);
  /** Error toast used when the thrown value isn't an Error. */
  errorFallback: string;
  /** Success work beyond toasting (clear fields, close panels, set "saved"
   * flags, follow-up requests). Runs inside the try, before the success
   * toast — a throw here lands in the same error toast as the mutation. */
  onSuccess?: (data: T) => void | Promise<void>;
  /** Set false for flows that don't re-render server data. Default true. */
  refresh?: boolean;
};

/**
 * The one mutation choreography behind every clientGql write button/form:
 * guard re-entry while busy, run the mutation, do the component's success
 * work, toast, then `router.refresh()` inside a transition. `busy` covers
 * both the in-flight await and the refresh transition, so callers can keep
 * controls disabled until the fresh server render lands.
 */
export function useGqlAction() {
  const router = useRouter();
  const { toast, toastError } = useToast();
  const [isPending, startTransition] = useTransition();
  const [inFlight, setInFlight] = useState(false);
  // Same-tick double-click guard: state hasn't re-rendered yet, so the
  // closure's `isPending`/`inFlight` alone would let a second call through.
  const inFlightRef = useRef(false);

  async function run<T = unknown>(
    query: string,
    variables: Record<string, unknown> | undefined,
    opts: GqlActionOptions<T>,
  ): Promise<void> {
    if (inFlightRef.current || isPending) return;
    inFlightRef.current = true;
    setInFlight(true);
    try {
      const data = await clientGql<T>(query, variables);
      await opts.onSuccess?.(data);
      if (opts.success !== undefined) {
        toast(
          typeof opts.success === "function"
            ? opts.success(data)
            : opts.success,
        );
      }
      if (opts.refresh !== false) {
        startTransition(() => router.refresh());
      }
    } catch (err) {
      toastError(err instanceof Error ? err.message : opts.errorFallback);
    } finally {
      inFlightRef.current = false;
      setInFlight(false);
    }
  }

  return { run, busy: inFlight || isPending };
}
