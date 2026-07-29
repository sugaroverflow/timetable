"use client";

/** Grow the box to fit its content; never shrink (so a manual drag-resize
 * is respected). border-box height = scrollHeight + the 2px of borders. */
function fit(el: HTMLTextAreaElement) {
  if (el.scrollHeight > el.clientHeight) {
    el.style.height = `${el.scrollHeight + 2}px`;
  }
}

/**
 * Comment-box textarea (QA 2026-07-29): rests at the send button's height
 * (CSS: .inline-form textarea, 40px — the button stays a circle) and grows
 * as content wraps — on input while typing, and on mount for prefilled
 * bodies (editing a long comment). Drag-resize still works and is never
 * shrunk back.
 */
export function GrowingTextarea({
  ref,
  onInput,
  ...rest
}: React.ComponentProps<"textarea">) {
  const attach = (el: HTMLTextAreaElement | null) => {
    if (el) fit(el);
    if (typeof ref === "function") ref(el);
    else if (ref) ref.current = el;
  };
  return (
    <textarea
      {...rest}
      ref={attach}
      onInput={(e) => {
        fit(e.currentTarget);
        onInput?.(e);
      }}
    />
  );
}
