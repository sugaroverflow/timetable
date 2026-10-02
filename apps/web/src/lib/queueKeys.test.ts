import { describe, expect, it } from "vitest";

import { isTypingTarget, queueKeyAction } from "@/lib/queueKeys";

/** The Topic Queue's arrow mapping. The cases that matter are the ones
 * where the queue must NOT act: a modifier belongs to the browser, and a
 * keystroke inside the composer belongs to the composer. */
describe("queue-keys", () => {
  it("maps the four arrows", () => {
    expect(queueKeyAction({ key: "ArrowLeft" })).toBe("back");
    expect(queueKeyAction({ key: "ArrowRight" })).toBe("next");
    expect(queueKeyAction({ key: "ArrowUp" })).toBe("heart");
    expect(queueKeyAction({ key: "ArrowDown" })).toBe("comment");
  });

  it("ignores every other key", () => {
    expect(queueKeyAction({ key: "Enter" })).toBeNull();
    expect(queueKeyAction({ key: "j" })).toBeNull();
    expect(queueKeyAction({ key: " " })).toBeNull();
  });

  it("leaves modified arrows to the browser", () => {
    expect(queueKeyAction({ key: "ArrowLeft", metaKey: true })).toBeNull();
    expect(queueKeyAction({ key: "ArrowRight", ctrlKey: true })).toBeNull();
    expect(queueKeyAction({ key: "ArrowDown", altKey: true })).toBeNull();
    expect(queueKeyAction({ key: "ArrowUp", shiftKey: true })).toBeNull();
  });

  it("stands down while the member is typing", () => {
    expect(isTypingTarget({ tagName: "TEXTAREA" })).toBe(true);
    expect(isTypingTarget({ tagName: "INPUT" })).toBe(true);
    expect(isTypingTarget({ tagName: "SELECT" })).toBe(true);
    expect(isTypingTarget({ tagName: "DIV", isContentEditable: true })).toBe(
      true,
    );
  });

  it("acts on keystrokes from the page itself", () => {
    expect(isTypingTarget({ tagName: "BODY" })).toBe(false);
    expect(isTypingTarget({ tagName: "BUTTON" })).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});
