import { afterEach, describe, expect, it, vi } from "vitest";

import { imageFiles, shrinkImage, shrunkSize } from "./uploadImage";

describe("shrinkImage", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("preserves GIF files and their original names", async () => {
    const file = new File(["gif"], "animation.gif", { type: "image/gif" });
    await expect(shrinkImage(file)).resolves.toBe(file);
  });

  it("preserves files the browser cannot decode", async () => {
    vi.stubGlobal("createImageBitmap", vi.fn().mockRejectedValue(new Error()));
    const file = new File(["image"], "photo.png", { type: "image/png" });
    await expect(shrinkImage(file)).resolves.toBe(file);
  });

  it("preserves small images without assigning to their read-only names", async () => {
    const close = vi.fn();
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn().mockResolvedValue({
        width: 800,
        height: 600,
        close,
      }),
    );
    const file = new File(["image"], "photo.png", { type: "image/png" });
    await expect(shrinkImage(file)).resolves.toBe(file);
    expect(close).toHaveBeenCalledOnce();
  });

  it.each(["no context", "no encoded blob", "webp", "jpeg"])(
    "handles large images with %s",
    async (result) => {
      const close = vi.fn();
      vi.stubGlobal(
        "createImageBitmap",
        vi.fn().mockResolvedValue({
          width: 3200,
          height: 2400,
          close,
        }),
      );
      const ctx = { drawImage: vi.fn(), fillRect: vi.fn() };
      const canvas = {
        width: 0,
        height: 0,
        getContext: () => (result === "no context" ? null : ctx),
        toBlob: (callback: BlobCallback, type: string) =>
          callback(
            type === `image/${result}` ? new Blob(["encoded"], { type }) : null,
          ),
      };
      vi.stubGlobal("document", { createElement: () => canvas });
      const file = new File(["image"], "photo.png", { type: "image/png" });
      const shrunk = await shrinkImage(file);
      if (result === "webp" || result === "jpeg") {
        expect(shrunk.name).toBe(
          result === "webp" ? "image.webp" : "image.jpg",
        );
        expect(shrunk.type).toBe(`image/${result}`);
        expect(shrunk.size).toBe(7);
        expect(ctx.drawImage).toHaveBeenCalledWith(
          expect.anything(),
          0,
          0,
          1600,
          1200,
        );
      } else {
        expect(shrunk).toBe(file);
      }
      expect(close).toHaveBeenCalledOnce();
    },
  );
});

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

describe("imageFiles", () => {
  const file = (name: string, type: string) => new File(["x"], name, { type });

  it("picks the image files out of a paste or drop", () => {
    const png = file("a.png", "image/png");
    const jpg = file("b.jpg", "image/jpeg");
    expect(
      imageFiles({ files: [png, file("notes.txt", "text/plain"), jpg] }),
    ).toEqual([png, jpg]);
  });

  it("is empty for a text-only clipboard, so the paste stays plain text", () => {
    expect(imageFiles({ files: [] })).toEqual([]);
    expect(imageFiles(null)).toEqual([]);
    expect(imageFiles(undefined)).toEqual([]);
  });
});
