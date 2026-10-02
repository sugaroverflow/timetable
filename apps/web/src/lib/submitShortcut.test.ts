import { describe, expect, it } from "vitest";

import { isSubmitShortcut } from "@/lib/submitShortcut";

/** submit-shortcut (#361): Ctrl/⌘+Enter posts; everything else that looks
 * like it — plain Enter, Shift+Enter, an IME committing — must not. */
describe("submit-shortcut", () => {
  it("posts on Ctrl+Enter and ⌘+Enter", () => {
    expect(isSubmitShortcut({ key: "Enter", ctrlKey: true })).toBe(true);
    expect(isSubmitShortcut({ key: "Enter", metaKey: true })).toBe(true);
  });

  it("leaves plain Enter and Shift+Enter to the textarea", () => {
    expect(isSubmitShortcut({ key: "Enter" })).toBe(false);
    expect(isSubmitShortcut({ key: "Enter", shiftKey: true })).toBe(false);
    expect(
      isSubmitShortcut({ key: "Enter", ctrlKey: true, shiftKey: true }),
    ).toBe(false);
    expect(
      isSubmitShortcut({ key: "Enter", metaKey: true, altKey: true }),
    ).toBe(false);
  });

  it("ignores other keys with Ctrl/⌘", () => {
    expect(isSubmitShortcut({ key: "a", ctrlKey: true })).toBe(false);
    expect(isSubmitShortcut({ key: "Tab", metaKey: true })).toBe(false);
  });

  it("never posts while an input method is composing", () => {
    expect(
      isSubmitShortcut({ key: "Enter", ctrlKey: true, isComposing: true }),
    ).toBe(false);
    // React's synthetic event keeps the flag on nativeEvent.
    expect(
      isSubmitShortcut({
        key: "Enter",
        metaKey: true,
        nativeEvent: { isComposing: true },
      }),
    ).toBe(false);
    expect(
      isSubmitShortcut({ key: "Enter", ctrlKey: true, keyCode: 229 }),
    ).toBe(false);
  });
});
