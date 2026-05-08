// Generate docs/art/iso-grid-reference.png — the master ISO grid PNG.
//
// EVERY tile (floor / wall / furniture) PixelLab call MUST cite this file as
// `reference_image`. It locks the floor-edge angle to canonical iso 30° so
// individual tiles, when composed into a floor plan at runtime, do not drift.
//
// Geometry — see art-bible v3.0 §1:
//   - True isometric 1:1:1, 30° elevation, 45° azimuth
//   - Floor tile canvas: 64×32 (PixelLab native output cell)
//   - Inside each cell, the rhombus is 56×32 (4-px transparent margins on
//     left/right). With half-width 28 and half-height 16, the floor edges
//     have slope 16/28 → angle = arctan(16/28) ≈ 29.74°, which is within
//     HR12's ±2° tolerance of 30°. Filling the rhombus to 64-wide would
//     give 26.57° (the common "2:1 dimetric") — that's what we are NOT.
//   - Regular hexagonal cube outline: floor edge length sqrt(28²+16²) ≈
//     32.25 px ≈ wall column height 32 px → all 6 outline edges of one
//     cube are equal, giving a regular hexagon.
//
// Layout (256×256 canvas):
//   - background: ramp 0 light #e8d8c4 (soft cream)
//   - top half  (rows 0–127): 4 × 4 grid of 64×32 tile cells, each showing
//     the 56×32 rhombus at canonical 30°, outlined ramp 0 darkest #1a1226
//   - bottom half (rows 128–255): one isolated cube wireframe (floor +
//     one cube-height wall, total 56×64) centred at (128, 192), to
//     demonstrate the regular hexagonal cube outline
//
// Byte-deterministic: same script + same palette → same PNG. We never
// sample sub-pixel positions; line drawing uses integer Bresenham.
//
// Usage:
//   pnpm --filter @firefly-mesh/scene-tools build:iso-grid

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir } from "node:fs/promises";

import sharp from "sharp";

import { hexToRgb } from "./palette.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, "..", "..");
const OUT_PATH = join(REPO_ROOT, "docs", "art", "iso-grid-reference.png");

const W = 256;
const H = 256;

// Palette colours used (must be members of the master 32-colour palette).
const BG = hexToRgb("#e8d8c4"); // ramp 0 light
const FG = hexToRgb("#1a1226"); // ramp 0 darkest (1-px outline per HR; art-bible §1)

// Tile cell geometry.
const CELL_W = 64;
const CELL_H = 32;
const RHOMB_HALF_W = 28; // → 56-wide rhombus inside 64-wide cell
const RHOMB_HALF_H = 16; // → fills the 32-tall cell exactly

// One cube outline geometry (drawn in the bottom half).
const CUBE_W = 56;
const CUBE_FLOOR_H = 32;
const CUBE_WALL_H = 32; // == floor edge length (rounded to int) → regular hexagon

function setPixel(buf, x, y, [r, g, b]) {
  if (x < 0 || x >= W || y < 0 || y >= H) return;
  const i = (y * W + x) * 4;
  buf[i + 0] = r;
  buf[i + 1] = g;
  buf[i + 2] = b;
  buf[i + 3] = 255;
}

// Bresenham integer line — guarantees no anti-aliasing, no partial-alpha.
// HR8 compliant.
function drawLine(buf, x0, y0, x1, y1, colour) {
  let dx = Math.abs(x1 - x0);
  let dy = -Math.abs(y1 - y0);
  let sx = x0 < x1 ? 1 : -1;
  let sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let x = x0;
  let y = y0;
  for (;;) {
    setPixel(buf, x, y, colour);
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

// Draw a rhombus outline at canonical iso 30° edges.
// `cx, cy` is the rhombus centre in canvas coords.
function drawRhombus(buf, cx, cy, halfW, halfH, colour) {
  const top = [cx, cy - halfH];
  const right = [cx + halfW, cy];
  const bottom = [cx, cy + halfH];
  const left = [cx - halfW, cy];
  drawLine(buf, top[0], top[1], right[0], right[1], colour);
  drawLine(buf, right[0], right[1], bottom[0], bottom[1], colour);
  drawLine(buf, bottom[0], bottom[1], left[0], left[1], colour);
  drawLine(buf, left[0], left[1], top[0], top[1], colour);
}

// Draw a vertical line — used for cube wall columns.
function drawVLine(buf, x, y0, y1, colour) {
  const a = Math.min(y0, y1);
  const b = Math.max(y0, y1);
  for (let y = a; y <= b; y++) setPixel(buf, x, y, colour);
}

async function main() {
  // Step 1 — fill background with ramp 0 light.
  const buf = Buffer.alloc(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    buf[i * 4 + 0] = BG[0];
    buf[i * 4 + 1] = BG[1];
    buf[i * 4 + 2] = BG[2];
    buf[i * 4 + 3] = 255;
  }

  // Step 2 — top half: 4 × 4 grid of canonical 30° rhombi.
  // Cells laid out in a hex-tessellation pattern (every other row offset
  // by half-cell-width to demonstrate how floor tiles tile cleanly).
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      const offsetX = (row % 2) * (CELL_W / 2);
      const cx = col * CELL_W + CELL_W / 2 + offsetX;
      const cy = row * CELL_H + CELL_H / 2;
      if (cx + RHOMB_HALF_W > W || cy + RHOMB_HALF_H > 128) continue;
      drawRhombus(buf, cx, cy, RHOMB_HALF_W, RHOMB_HALF_H, FG);
    }
  }

  // Step 3 — bottom half: one isolated cube wireframe at (128, 192) base.
  // The cube has 6 visible outline edges:
  //   - 4 floor-rhombus edges at 30°
  //   - 2 vertical wall column edges (left and right)
  // For a regular hexagonal cube outline the wall column height must equal
  // the floor rhombus edge length (sqrt(28² + 16²) ≈ 32.25 → rounded to 32).
  const baseCx = 128;
  const baseCy = 192 + RHOMB_HALF_H; // bottom rhombus centre
  const topCy = baseCy - CUBE_WALL_H; // top rhombus centre (above by CUBE_WALL_H)

  // Bottom rhombus (floor of cube).
  drawRhombus(buf, baseCx, baseCy, RHOMB_HALF_W, RHOMB_HALF_H, FG);

  // Top rhombus (ceiling = floor of cube above).
  drawRhombus(buf, baseCx, topCy, RHOMB_HALF_W, RHOMB_HALF_H, FG);

  // Two vertical wall columns connecting bottom & top rhombi.
  // Connect the LEFT and RIGHT vertices of the rhombi (the side vertices,
  // not top/bottom). Side vertices: (baseCx ± RHOMB_HALF_W, baseCy / topCy).
  drawVLine(
    buf,
    baseCx - RHOMB_HALF_W,
    topCy,
    baseCy,
    FG,
  );
  drawVLine(
    buf,
    baseCx + RHOMB_HALF_W,
    topCy,
    baseCy,
    FG,
  );

  // Step 4 — write PNG with byte-deterministic palette mode.
  await mkdir(dirname(OUT_PATH), { recursive: true });

  await sharp(buf, {
    raw: { width: W, height: H, channels: 4 },
  })
    .png({
      palette: true,
      compressionLevel: 9,
      effort: 10,
    })
    .toFile(OUT_PATH);

  // Step 5 — human-readable summary.
  const floorEdgeLen = Math.sqrt(
    RHOMB_HALF_W * RHOMB_HALF_W + RHOMB_HALF_H * RHOMB_HALF_H,
  );
  const edgeAngleDeg =
    (Math.atan2(RHOMB_HALF_H, RHOMB_HALF_W) * 180) / Math.PI;
  console.log(`✓ wrote ${OUT_PATH}`);
  console.log(`  ${W} × ${H} px, indexed PNG`);
  console.log(`  rhombus: ${RHOMB_HALF_W * 2} × ${RHOMB_HALF_H * 2}`);
  console.log(
    `  edge angle: ${edgeAngleDeg.toFixed(2)}° (HR12 target 30° ± 2°)`,
  );
  console.log(`  edge length: ${floorEdgeLen.toFixed(2)} px`);
  console.log(
    `  wall col height: ${CUBE_WALL_H} px (regular hex if ≈ edge length)`,
  );
}

main().catch((err) => {
  console.error("✗ build-iso-grid-reference failed:");
  console.error(err);
  process.exit(1);
});
