"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";

type Mode = "system" | "light" | "dark";

function apply(mode: Mode) {
  const dark =
    mode === "dark" ||
    (mode === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}

// Tiny external store around localStorage so the toggle re-renders without
// effect-driven setState (react-hooks/set-state-in-effect).
const listeners = new Set<() => void>();
function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
function getMode(): Mode {
  const stored = window.localStorage.getItem("theme-mode");
  return stored === "light" || stored === "dark" ? stored : "system";
}
function setMode(mode: Mode) {
  window.localStorage.setItem("theme-mode", mode);
  apply(mode);
  for (const cb of listeners) cb();
}

/** Per-user light/dark toggle (QA #59). The choice lives in localStorage;
 * a pre-paint script in the root layout applies it before hydration so
 * there is no flash. */
export function ThemeToggle() {
  const mode = useSyncExternalStore(subscribe, getMode, () => "system" as Mode);

  function cycle() {
    setMode(mode === "system" ? "dark" : mode === "dark" ? "light" : "system");
  }

  const Icon = mode === "dark" ? Moon : mode === "light" ? Sun : Monitor;
  const label = mode === "dark" ? "Dark" : mode === "light" ? "Light" : "Auto";

  return (
    <button
      type="button"
      className="btn btn-ghost theme-toggle"
      onClick={cycle}
      title={`Theme: ${label} — click to change`}
      aria-label={`Theme: ${label} — click to change`}
    >
      <Icon size={16} aria-hidden /> {label}
    </button>
  );
}
