import { describe, expect, it } from "vitest";

import {
  markInteracted,
  markTraversed,
  saveFeedPosition,
  takeFeedPosition,
} from "@/lib/feedPosition";

/** The gate that decides whether Back restores your place in the feed.
 * Every case here is one the store must get right for the restore not to
 * fire when the user did not press Back. */
describe("feed-position-store", () => {
  it("does not restore without a history traversal", () => {
    saveFeedPosition("plain-visit", { pages: 2, scrollY: 900 });
    expect(takeFeedPosition("plain-visit")).toBeNull();
  });

  it("restores the saved position after a traversal", () => {
    saveFeedPosition("back", { pages: 3, scrollY: 1200 });
    markTraversed();
    expect(takeFeedPosition("back")).toEqual({ pages: 3, scrollY: 1200 });
  });

  it("restores once per traversal", () => {
    saveFeedPosition("once", { pages: 2, scrollY: 400 });
    markTraversed();
    expect(takeFeedPosition("once")).not.toBeNull();
    expect(takeFeedPosition("once")).toBeNull();
  });

  it("never restores another feed view's position", () => {
    saveFeedPosition("sort=newest", { pages: 4, scrollY: 2000 });
    markTraversed();
    expect(takeFeedPosition("sort=random|seed=abc")).toBeNull();
  });

  it("a click after the traversal disarms the restore", () => {
    saveFeedPosition("clicked-through", { pages: 3, scrollY: 800 });
    markTraversed();
    markInteracted();
    expect(takeFeedPosition("clicked-through")).toBeNull();
  });

  it("ignores a position with nothing appended — page one needs no replay", () => {
    saveFeedPosition("shallow", { pages: 0, scrollY: 120 });
    markTraversed();
    expect(takeFeedPosition("shallow")).toBeNull();
  });
});
