"use client";

import { ChevronDown } from "lucide-react";
import type { SelectHTMLAttributes } from "react";

/** The minimalist select: chevron on the left, chromeless `<select>` styled
 * by the global `.select-minimal` class. All select props pass through;
 * options come as children. */
export function SelectMinimal(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className="select-minimal">
      <ChevronDown size={14} aria-hidden />
      <select {...props} />
    </span>
  );
}
