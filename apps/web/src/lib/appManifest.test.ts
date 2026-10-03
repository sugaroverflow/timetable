import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { APPLE_TOUCH_ICON, APP_ICONS, appManifest } from "./appManifest";

const PUBLIC_DIR = join(__dirname, "../../public");
const TOKENS = readFileSync(join(__dirname, "../app/tokens.css"), "utf8");

/** Width × height from a PNG's IHDR chunk (bytes 16–23). */
function pngSize(path: string): string {
  const buf = readFileSync(join(PUBLIC_DIR, path));
  expect(buf.subarray(1, 4).toString("ascii")).toBe("PNG");
  return `${buf.readUInt32BE(16)}x${buf.readUInt32BE(20)}`;
}

/** The first value a token is given in tokens.css (its light value). */
function tokenValue(name: string): string | undefined {
  return new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`).exec(TOKENS)?.[1];
}

describe("appManifest", () => {
  it("installs as one standalone app named Topic", () => {
    const m = appManifest();
    expect(m.name).toBe("Topic");
    expect(m.short_name).toBe("Topic");
    expect(m.display).toBe("standalone");
    expect(m.start_url).toBe("/timetables");
    expect(m.scope).toBe("/");
    expect(m.id).toBe("/");
  });

  it("keeps its colours in step with the tokens they copy", () => {
    const m = appManifest();
    expect(m.theme_color).toBe(tokenValue("card"));
    expect(m.background_color).toBe(tokenValue("bg"));
  });

  it("offers 192 and 512 icons plus a maskable 512", () => {
    const icons = APP_ICONS ?? [];
    expect(icons.map((i) => `${i.sizes} ${i.purpose}`)).toEqual([
      "192x192 any",
      "512x512 any",
      "512x512 maskable",
    ]);
  });

  it("points every icon at a committed PNG of the declared size", () => {
    for (const icon of APP_ICONS ?? []) {
      expect(icon.type).toBe("image/png");
      expect(pngSize(icon.src)).toBe(icon.sizes);
    }
    expect(pngSize(APPLE_TOUCH_ICON)).toBe("180x180");
  });
});
