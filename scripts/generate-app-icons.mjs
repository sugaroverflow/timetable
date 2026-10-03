#!/usr/bin/env node
/**
 * installable-app (#367): writes the Home Screen / install icons the web
 * app manifest and the apple-touch-icon link point at —
 *
 *   apps/web/public/icon-192.png           manifest, purpose "any"
 *   apps/web/public/icon-512.png           manifest, purpose "any"
 *   apps/web/public/icon-maskable-512.png  manifest, purpose "maskable"
 *   apps/web/public/apple-touch-icon.png   180px, iOS Home Screen
 *
 * The mark is the app's 📚 (the favicon, the topbar brand and the OG card
 * all use it), drawn from the vendored Twemoji SVG in scripts/assets
 * (CC-BY 4.0 — attribution in that file and in the journal entry), so the
 * icon looks the same on every device instead of borrowing whichever
 * emoji font the build machine has. Each icon is an OPAQUE white square
 * (#ffffff = --card in tokens.css, the light topbar's surface): iOS fills
 * transparency with black, and Android masks "any" icons onto its own
 * shape anyway.
 *
 * Sizing: the books fill 68% of the square on the plain and Apple icons;
 * the maskable one keeps them to 56%, so their corners (the diagonal is
 * 0.56 × √2 ≈ 0.79) stay inside the 80% safe-zone circle a launcher may
 * crop to.
 *
 * Deterministic: the same SVG and the same sharp/libvips build produce
 * byte-identical PNGs (no timestamps or metadata are written). sharp is
 * not a declared dependency — it ships with Next (an optional dependency
 * of `next`), so it is in node_modules after `npm ci`. Run from the repo
 * root:
 *
 *   node scripts/generate-app-icons.mjs
 *
 * and commit the PNGs. Nothing runs this at build time.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(
  join(root, "scripts/assets/twemoji-1f4da.svg"),
  "utf8",
);
// The <svg> element's children — the emoji's own 36×36 drawing.
const inner = /<svg[^>]*>([\s\S]*)<\/svg>/.exec(source)?.[1];
if (!inner) throw new Error("twemoji-1f4da.svg: no <svg> body found");

const BACKGROUND = "#ffffff"; // --card (tokens.css, light)

const ICONS = [
  { file: "icon-192.png", size: 192, fill: 0.68 },
  { file: "icon-512.png", size: 512, fill: 0.68 },
  { file: "icon-maskable-512.png", size: 512, fill: 0.56 },
  { file: "apple-touch-icon.png", size: 180, fill: 0.68 },
];

function iconSvg(size, fill) {
  const art = size * fill;
  const offset = (size - art) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
<rect width="${size}" height="${size}" fill="${BACKGROUND}"/>
<svg x="${offset}" y="${offset}" width="${art}" height="${art}" viewBox="0 0 36 36">${inner}</svg>
</svg>`;
}

for (const { file, size, fill } of ICONS) {
  const png = await sharp(Buffer.from(iconSvg(size, fill)))
    .flatten({ background: BACKGROUND })
    .png({ compressionLevel: 9, adaptiveFiltering: false, palette: false })
    .toBuffer();
  writeFileSync(join(root, "apps/web/public", file), png);
  console.log(`apps/web/public/${file}  ${size}×${size}  ${png.length} bytes`);
}
