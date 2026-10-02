"use client";

/** Toggle switch (QA 2026-08-03 — replaces checkboxes/radios on Forum
 * Settings): the queue ❤️ switch's track/thumb, generalized. The whole
 * row — track and label — is one press target. */
export function Switch({
  checked,
  onChange,
  label,
  hint,
  disabled = false,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: React.ReactNode;
  hint?: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className="ui-switch-row"
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span className={`ui-switch${checked ? " on" : ""}`} aria-hidden>
        <span className="ui-switch-thumb" />
      </span>
      <span className="ui-switch-label">
        {label}
        {hint ? (
          <span className="hint" style={{ display: "block" }}>
            {hint}
          </span>
        ) : null}
      </span>
    </button>
  );
}
