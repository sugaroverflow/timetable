import { describe, expect, it } from "vitest";

import { shrunkSize } from "./uploadImage";

describe("shrunkSize", () => {
  it("leaves small images that already fit alone", () => {
    expect(shrunkSize(1200, 800, 400_000)).toBeNull();
  });

  it("scales the long edge down to 1600, keeping the aspect ratio", () => {
    expect(shrunkSize(4032, 3024, 3_000_000)).toEqual({
      width: 1600,
      height: 1200,
    });
    expect(shrunkSize(3024, 4032, 3_000_000)).toEqual({
      width: 1200,
      height: 1600,
    });
  });

  it("re-encodes a heavy image even when it already fits", () => {
    expect(shrunkSize(1500, 1000, 4_000_000)).toEqual({
      width: 1500,
      height: 1000,
    });
  });
});
