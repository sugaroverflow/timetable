/**
 * submit-shortcut (#361, 2026-10-02): Ctrl+Enter (Windows/Linux) and
 * ⌘+Enter (Mac) post a comment, as on Gmail and GitHub. One rule for every
 * composer: the shortcut presses the form's send button — the same submit
 * handler, the same empty-text check, and nothing while that button is
 * disabled, so an in-flight post is never doubled.
 */

/** The shape of a keydown this needs — a DOM KeyboardEvent or React's
 * synthetic one (which keeps `isComposing` on `nativeEvent`). */
export type SubmitKeyLike = {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  isComposing?: boolean;
  keyCode?: number;
  nativeEvent?: { isComposing?: boolean };
};

/** Screen readers announce this on the send buttons it presses. */
export const SUBMIT_SHORTCUT_ARIA = "Control+Enter Meta+Enter";

/** Ctrl+Enter or ⌘+Enter — never plain/Shift/Alt+Enter, and never while an
 * input method is composing (Enter there commits the composition; keyCode
 * 229 is how some browsers report that keydown). */
export function isSubmitShortcut(e: SubmitKeyLike): boolean {
  if (e.key !== "Enter") return false;
  if (!e.ctrlKey && !e.metaKey) return false;
  if (e.altKey || e.shiftKey) return false;
  if (e.isComposing || e.nativeEvent?.isComposing || e.keyCode === 229) {
    return false;
  }
  return true;
}

function isSubmitter(el: Element): el is HTMLButtonElement | HTMLInputElement {
  return (
    (el instanceof HTMLButtonElement || el instanceof HTMLInputElement) &&
    el.type === "submit"
  );
}

/** Press the send button of the form around `el`, as a click would. Only
 * when the form has ONE submit button (a single obvious action) and it is
 * enabled; returns whether a submit was requested. */
export function submitFormFrom(el: Element | null): boolean {
  const form = el?.closest("form");
  if (!form) return false;
  const submitters = Array.from(form.elements).filter(isSubmitter);
  if (submitters.length > 1) return false;
  const button = submitters[0];
  if (button?.disabled) return false;
  form.requestSubmit(button);
  return true;
}

/** A keydown handler's whole job: on the shortcut, swallow the key and
 * submit the surrounding form. Returns whether it was the shortcut. */
export function handleSubmitShortcut(
  e: SubmitKeyLike & { currentTarget: EventTarget | null; preventDefault(): void },
): boolean {
  if (!isSubmitShortcut(e)) return false;
  e.preventDefault();
  submitFormFrom(e.currentTarget instanceof Element ? e.currentTarget : null);
  return true;
}
