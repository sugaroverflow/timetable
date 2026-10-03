"use client";

/** Toggle switch (QA 2026-08-03 — replaces checkboxes/radios on Forum
 * Settings): the queue ❤️ switch's track/thumb, generalized. The whole
 * row — track and label — is one press target. A bare switch (a table
 * cell whose row and column say what it is, like the Email/Push columns
 * of "What to include") passes `ariaLabel` and no `label`. */
export function Switch({
  checked,
  onChange,
  label,
  ariaLabel,
  hint,
  disabled = false,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label?: React.ReactNode;
  /** The accessible name when there is no visible label. */
  ariaLabel?: string;
  hint?: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      className="ui-switch-row"
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span className={`ui-switch${checked ? " on" : ""}`} aria-hidden>
        <span className="ui-switch-thumb" />
      </span>
      {label !== undefined ? (
        <span className="ui-switch-label">
          {label}
          {hint ? (
            <span className="hint" style={{ display: "block" }}>
              {hint}
            </span>
          ) : null}
        </span>
      ) : null}
    </button>
  );
}
