/**
 * queue-keys: the Topic Queue's arrow mapping — ← back, → next, ↑ ❤️,
 * ↓ comment. Pure, so the mapping is unit-tested without a DOM and the
 * component keeps only the wiring.
 */
export type QueueKeyAction = "back" | "next" | "heart" | "comment";

const KEY_ACTIONS: Record<string, QueueKeyAction> = {
  ArrowLeft: "back",
  ArrowRight: "next",
  ArrowUp: "heart",
  ArrowDown: "comment",
};

/** The action an arrow press asks for, or null for anything else. Any
 * modifier means the keystroke belongs to the browser (⌘← is history
 * back, ⌥↓ jumps a paragraph) — those pass straight through. */
export function queueKeyAction(event: {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
}): QueueKeyAction | null {
  if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
    return null;
  }
  return KEY_ACTIONS[event.key] ?? null;
}

/** True while the keystroke belongs to something being typed in — above
 * all the composer that ↓ just opened, where ↓ moves the caret and Enter
 * posts (CommentComposer's `submitOnEnter`). */
export function isTypingTarget(
  target: { tagName?: string; isContentEditable?: boolean } | null | undefined,
): boolean {
  if (!target) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}
