// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { pushSupport } from "./push";
afterEach(() => vi.restoreAllMocks());
describe("push platform detection", () => {
  it("recognises an iPad with a desktop user agent outside standalone mode", () => {
    vi.spyOn(navigator, "platform", "get").mockReturnValue("MacIntel");
    Object.defineProperty(navigator, "maxTouchPoints", {
      configurable: true,
      value: 5,
    });
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: () => ({ matches: false }),
    });
    expect(pushSupport()).toContain("Home Screen");
  });
});
