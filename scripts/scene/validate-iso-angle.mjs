// HR12 enforcement — iso-angle gate for floor tiles.
//
// Validates that a tile PNG's bottom floor edges land within ±2° of canonical
// iso 30°. Catches the v2.0 failure mode where some PixelLab room PNGs were
// 22.5° (2:1 dimetric / 26.57°) and others were closer to 30° true iso —
// adjacent placement was visually broken because angles disagreed.
//
// Algorithm:
//   1. Read PNG via sharp; pull raw RGBA buffer.
//   2. Build a binary mask: pixel is "present" if alpha > 127 (HR8 says no
//      partial alpha, so this is a clean 0/1 distinction).
//   3. Restrict attention to the bottom THIRD of the canvas — this is where
//      the floor rhombus's lower edges live for both floor tiles (entire
//      tile is rhombus) and wall tiles (rhombus footprint at base).
//   4. For each row in the bottom third, find the leftmost and rightmost
//      present pixel.
//   5. Linear-regression on the (row, leftmost-x) sequence → slope_left.
//      Same on (row, rightmost-x) → slope_right. The two slopes have
//      opposite signs (the rhombus narrows on both sides going down).
//   6. Edge angle from horizontal = arctan(1 / |slope|), where slope is
//      d(x)/d(row). For the canonical iso rhombus, |slope| = 28/16 = 1.75
//      → angle = arctan(1/1.75) = arctan(0.5714) ≈ 29.74° ≈ 30°.
//   7. Pass if both slopes (and hence both angles) are within 30° ± 2°.
//
// Usage:
//   node validate-iso-angle.mjs <path-to-tile.png>
//
// Exit codes:
//   0  — pass
//   12 — angle drifted (HR12 violation)
//   1  — other error (file missing, bad format, etc.)
//
// Reference test:
//   - Pass: docs/art/iso-grid-reference.png (29.74° edges by construction)
//   - Fail: a synthetic 22.5° (2:1 dimetric) tile

import { readFile } from "node:fs/promises";

import sharp from "sharp";

export const CANONICAL_ANGLE_DEG = 30;
export const TOLERANCE_DEG = 2;

export const HR12_EXIT = 12;

async function loadMask(path) {
  const meta = await sharp(path).metadata();
  if (!meta.width || !meta.height) {
    throw new Error(`Cannot read ${path} — sharp returned no dimensions`);
  }
  const raw = await sharp(path)
    .ensureAlpha()
    .raw()
    .toBuffer();
  const W = meta.width;
  const H = meta.height;

  // Binary mask: present ↔ alpha > 127.
  const mask = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) {
    mask[i] = raw[i * 4 + 3] > 127 ? 1 : 0;
  }
  return { mask, W, H };
}

// Linear regression on (xs, ys) → slope (in y per x). Used to fit a line
// through the top-third of leftmost / rightmost pixels. We measure slope
// in the y direction (rows) per change in x (cols) so a perfectly vertical
// rhombus side gives infinite slope (vertical line); the canonical iso
// gives slope dy/dx = 16/28 ≈ 0.571.
function fitLine(xs, ys) {
  const n = xs.length;
  if (n < 2) return null;
  let sumX = 0;
  let sumY = 0;
  for (let i = 0; i < n; i++) {
    sumX += xs[i];
    sumY += ys[i];
  }
  const meanX = sumX / n;
  const meanY = sumY / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    num += dx * dy;
    den += dx * dx;
  }
  if (den === 0) return null;
  return num / den; // slope dy/dx
}

function detectFloorEdgeAngle({ mask, W, H }) {
  // Bottom third of canvas — rows in [floor(2*H/3), H-1].
  const yStart = Math.floor((2 * H) / 3);
  const leftXs = [];
  const leftYs = [];
  const rightXs = [];
  const rightYs = [];

  for (let y = yStart; y < H; y++) {
    let lx = -1;
    let rx = -1;
    for (let x = 0; x < W; x++) {
      if (mask[y * W + x]) {
        if (lx === -1) lx = x;
        rx = x;
      }
    }
    if (lx !== -1 && rx !== -1 && rx > lx) {
      leftXs.push(lx);
      leftYs.push(y);
      rightXs.push(rx);
      rightYs.push(y);
    }
  }

  if (leftXs.length < 3) {
    throw new Error(
      `Insufficient floor-edge samples in bottom third: ${leftXs.length} rows have content`,
    );
  }

  // Slope dy/dx for left edge: as we go down (y increases), the leftmost
  // x increases (rhombus narrows). Slope is positive.
  const slopeLeft = fitLine(leftXs, leftYs);
  // Slope dy/dx for right edge: as we go down, rightmost x decreases.
  // Slope is negative; we use absolute value.
  const slopeRight = fitLine(rightXs, rightYs);

  if (slopeLeft === null || slopeRight === null) {
    throw new Error(
      `Could not fit lines to floor edges (collinear or degenerate samples)`,
    );
  }

  // Angle from horizontal = arctan(|slope|). slope = dy/dx → angle = atan(slope).
  const angleLeft = (Math.atan(Math.abs(slopeLeft)) * 180) / Math.PI;
  const angleRight = (Math.atan(Math.abs(slopeRight)) * 180) / Math.PI;
  return { angleLeft, angleRight, samples: leftXs.length };
}

function checkAngle(label, angle) {
  const drift = Math.abs(angle - CANONICAL_ANGLE_DEG);
  const ok = drift <= TOLERANCE_DEG;
  return { label, angle, drift, ok };
}

/**
 * Programmatic API — used by validate-asset-qa.mjs for type=floor/wall/tile.
 *
 * @param {string} path - PNG path
 * @returns {Promise<{ok: boolean, angleLeft: number, angleRight: number,
 *                    driftLeft: number, driftRight: number, samples: number,
 *                    error?: string}>}
 */
export async function validateIsoAngle(path) {
  try {
    const data = await loadMask(path);
    const { angleLeft, angleRight, samples } = detectFloorEdgeAngle(data);
    const left = checkAngle("left", angleLeft);
    const right = checkAngle("right", angleRight);
    return {
      ok: left.ok && right.ok,
      angleLeft,
      angleRight,
      driftLeft: left.drift,
      driftRight: right.drift,
      samples,
    };
  } catch (err) {
    return {
      ok: false,
      angleLeft: NaN,
      angleRight: NaN,
      driftLeft: NaN,
      driftRight: NaN,
      samples: 0,
      error: err.message,
    };
  }
}

async function main() {
  const path = process.argv[2];
  if (!path) {
    console.error(`Usage: node validate-iso-angle.mjs <path-to-tile.png>`);
    process.exit(1);
  }

  // Confirm file exists.
  try {
    await readFile(path);
  } catch (err) {
    console.error(`✗ cannot read ${path}: ${err.message}`);
    process.exit(1);
  }

  const result = await validateIsoAngle(path);

  if (result.error) {
    console.error(`✗ validate-iso-angle failed: ${result.error}`);
    process.exit(1);
  }

  if (result.ok) {
    console.log(
      `✓ ${path}: floor edges within HR12 tolerance (canonical ${CANONICAL_ANGLE_DEG}° ± ${TOLERANCE_DEG}°)`,
    );
    console.log(
      `  left : ${result.angleLeft.toFixed(2)}° (drift ${result.driftLeft.toFixed(2)}°)`,
    );
    console.log(
      `  right: ${result.angleRight.toFixed(2)}° (drift ${result.driftRight.toFixed(2)}°)`,
    );
    console.log(`  samples in bottom third: ${result.samples}`);
    process.exit(0);
  }

  console.error(
    `✗ ${path}: floor angle drifted from canonical ${CANONICAL_ANGLE_DEG}° (HR12)`,
  );
  console.error(
    `  left : ${result.angleLeft.toFixed(2)}° (drift ${result.driftLeft.toFixed(2)}°) [${result.driftLeft <= TOLERANCE_DEG ? "OK" : "DRIFT"}]`,
  );
  console.error(
    `  right: ${result.angleRight.toFixed(2)}° (drift ${result.driftRight.toFixed(2)}°) [${result.driftRight <= TOLERANCE_DEG ? "OK" : "DRIFT"}]`,
  );
  console.error(`  tolerance: ±${TOLERANCE_DEG}°`);
  process.exit(HR12_EXIT);
}

// Only run as CLI when this is the main module (process.argv[1] === this file).
const invokedAsCli =
  process.argv[1] && process.argv[1].endsWith("validate-iso-angle.mjs");

if (invokedAsCli) {
  main().catch((err) => {
    console.error(`✗ validate-iso-angle failed: ${err.message}`);
    process.exit(1);
  });
}
