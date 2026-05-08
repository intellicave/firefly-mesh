// Generate two synthetic floor-tile fixtures for testing validate-iso-angle:
//   - canonical-30deg.png  (29.74° edges) → MUST pass HR12
//   - dimetric-22deg.png   (22.5° edges)  → MUST fail HR12
//
// These fixtures live next to the test runner; not part of the production
// asset pipeline.

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir } from "node:fs/promises";

import sharp from "sharp";

import { hexToRgb } from "../palette.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const FG = hexToRgb("#1a1226");

function setPixel(buf, x, y, w, [r, g, b]) {
  if (x < 0 || x >= w || y < 0) return;
  const i = (y * w + x) * 4;
  buf[i + 0] = r;
  buf[i + 1] = g;
  buf[i + 2] = b;
  buf[i + 3] = 255;
}

function drawLine(buf, x0, y0, x1, y1, w, h, colour) {
  let dx = Math.abs(x1 - x0);
  let dy = -Math.abs(y1 - y0);
  let sx = x0 < x1 ? 1 : -1;
  let sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let x = x0;
  let y = y0;
  for (;;) {
    if (x >= 0 && x < w && y >= 0 && y < h) setPixel(buf, x, y, w, colour);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
}

// Draw a filled rhombus by drawing many horizontal lines at each y.
function fillRhombus(buf, cx, cy, halfW, halfH, w, h, colour) {
  for (let dy = -halfH; dy <= halfH; dy++) {
    const t = Math.abs(dy) / halfH; // 0 at centre, 1 at top/bottom
    const span = Math.round(halfW * (1 - t));
    for (let dx = -span; dx <= span; dx++) {
      const x = cx + dx;
      const y = cy + dy;
      if (x >= 0 && x < w && y >= 0 && y < h) setPixel(buf, x, y, w, colour);
    }
  }
}

async function emitTile(name, width, height, halfW, halfH) {
  const buf = Buffer.alloc(width * height * 4); // alpha=0 by default → transparent
  fillRhombus(buf, Math.floor(width / 2), Math.floor(height / 2), halfW, halfH, width, height, FG);

  const outPath = join(__dirname, name);
  await mkdir(__dirname, { recursive: true });
  await sharp(buf, { raw: { width, height, channels: 4 } })
    .png({ palette: true, compressionLevel: 9, effort: 10 })
    .toFile(outPath);

  const angle = (Math.atan2(halfH, halfW) * 180) / Math.PI;
  console.log(`  ${name}: ${width}×${height}, rhombus ${halfW * 2}×${halfH * 2}, edge ${angle.toFixed(2)}°`);
  return outPath;
}

async function main() {
  console.log("Generating synthetic test fixtures:");
  // Canonical: 56×32 rhombus inside 64×32 → 29.74° (HR12 pass)
  await emitTile("canonical-30deg.png", 64, 32, 28, 16);
  // Dimetric: 64×32 rhombus filling 64×32 → 26.57° (HR12 fail, just outside ±2°)
  await emitTile("dimetric-26deg.png", 64, 32, 32, 16);
  // Worse dimetric: 80×40 rhombus inside 80×40 → 26.57° (same angle, larger)
  await emitTile("dimetric-22deg.png", 80, 32, 40, 8);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
