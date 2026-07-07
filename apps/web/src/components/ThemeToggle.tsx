"use client";

import { useEffect, useState } from "react";

type Mode = "system" | "light" | "dark";

function apply(mode: Mode) {
  const dark =
    mode === "dark" ||
    (mode === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}

/** Per-user light/dark toggle (QA #59). The choice lives in localStorage;
 * a beforeInteractive script in the root layout applies it pre-hydration
 * so there is no flash. */
export function ThemeToggle() {
  const [mode, setMode] = useState<Mode>("system");

  useEffect(() => {
    const stored = window.localStorage.getItem("theme-mode") as Mode | null;
    if (stored === "light" || stored === "dark") setMode(stored);
  }, []);

  function cycle() {
    const next: Mode =
      mode === "system" ? "dark" : mode === "dark" ? "light" : "system";
    setMode(next);
    window.localStorage.setItem("theme-mode", next);
    apply(next);
  }

  const icon = mode === "dark" ? "☾" : mode === "light" ? "☀" : "◑";
  const label =
    mode === "dark" ? "Dark" : mode === "light" ? "Light" : "Auto";

  return (
    <button
      type="button"
      className="btn btn-ghost theme-toggle"
      onClick={cycle}
      title={`Theme: ${label} — click to change`}
      aria-label={`Theme: ${label} — click to change`}
    >
      {icon} {label}
    </button>
  );
}
