// Asset post-process — runs after PixelLab returns a raw PNG, before QA gate.
//
// Pipeline:
//   1. Threshold alpha: any pixel with alpha < 128 → fully transparent (0);
//      alpha ≥ 128 → fully opaque (255). Stardew style has hard pixels, no
//      partial alpha.
//   2. Quantize each opaque pixel to nearest palette colour (euclidean RGB).
//   3. Optional crop to declared bounding box.
//   4. Optional outline-replace: any near-black opaque pixel forced to
//      OUTLINE_COLOUR (#1a1226).
//
// Pure transforms — no randomness, deterministic.
//
// Usage: imported by produce.mjs; or CLI:
//   node post-process.mjs <input.png> --out=<output.png> [--size=16x24]

import { readFile, writeFile } from "node:fs/promises";
import { argv, exit } from "node:process";

import sharp from "sharp";

import {
  PALETTE_RGB,
  hexToRgb,
  nearestPaletteIndex,
} from "./palette.mjs";

const ALPHA_THRESHOLD = 128;
const OUTLINE_COLOUR = "#1a1226";
const OUTLINE_RGB = hexToRgb(OUTLINE_COLOUR);

/** "Black-ish" pixels (likely aliased outline returned by PixelLab) get
 *  forced to the canonical outline colour. Threshold is sum-of-channels < 50. */
function isOutlineCandidate(r, g, b) {
  return r + g + b < 50;
}

/**
 * Post-process a raw PNG buffer. Returns a new PNG buffer.
 *
 * @param {Buffer} pngBuf - input PNG bytes
 * @param {object} opts - { size?: {w,h}, snapOutline?: boolean (default true) }
 */
export async function postProcessPng(pngBuf, opts = {}) {
  const snapOutline = opts.snapOutline !== false;

  // Decode to raw RGBA
  const img = sharp(pngBuf).ensureAlpha();
  let { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H, channels } = info;
  if (channels !== 4) {
    throw new Error(`Expected RGBA, got ${channels} channels`);
  }

  // Make a writable copy
  data = Buffer.from(data);

  for (let i = 0; i < data.length; i += 4) {
    let a = data[i + 3];

    // Step 1: threshold alpha
    if (a < ALPHA_THRESHOLD) {
      data[i + 0] = 0;
      data[i + 1] = 0;
      data[i + 2] = 0;
      data[i + 3] = 0;
      continue;
    }
    data[i + 3] = 255;

    let r = data[i + 0];
    let g = data[i + 1];
    let b = data[i + 2];

    // Step 2 (early): outline snap
    if (snapOutline && isOutlineCandidate(r, g, b)) {
      data[i + 0] = OUTLINE_RGB[0];
      data[i + 1] = OUTLINE_RGB[1];
      data[i + 2] = OUTLINE_RGB[2];
      continue;
    }

    // Step 3: palette quantize
    const idx = nearestPaletteIndex([r, g, b]);
    const [pr, pg, pb] = PALETTE_RGB[idx];
    data[i + 0] = pr;
    data[i + 1] = pg;
    data[i + 2] = pb;
  }

  // Step 4: optional crop / resize check
  let final = sharp(data, { raw: { width: W, height: H, channels: 4 } });
  if (opts.size && (opts.size.w !== W || opts.size.h !== H)) {
    final = final.resize(opts.size.w, opts.size.h, {
      kernel: "nearest",
      fit: "fill",
    });
  }

  return final
    .png({ palette: true, compressionLevel: 9, effort: 10 })
    .toBuffer();
}

/** CLI. */
async function cli() {
  const args = argv.slice(2);
  const inputPath = args[0];
  if (!inputPath) {
    console.error(
      "usage: post-process.mjs <input.png> --out=<output.png> [--size=WxH] [--no-snap-outline]",
    );
    exit(2);
  }
  let outPath = null;
  let size = null;
  let snapOutline = true;
  for (const a of args.slice(1)) {
    if (a.startsWith("--out=")) outPath = a.slice("--out=".length);
    else if (a.startsWith("--size=")) {
      const m = /^(\d+)x(\d+)$/.exec(a.slice("--size=".length));
      if (m) size = { w: parseInt(m[1], 10), h: parseInt(m[2], 10) };
    } else if (a === "--no-snap-outline") snapOutline = false;
  }
  if (!outPath) {
    console.error("--out=<path> is required");
    exit(2);
  }

  const buf = await readFile(inputPath);
  const out = await postProcessPng(buf, { size, snapOutline });
  await writeFile(outPath, out);
  console.log(`✓ post-processed ${inputPath} → ${outPath}`);
}

if (argv[1] && argv[1].endsWith("post-process.mjs")) {
  cli().catch((err) => {
    console.error("✗ post-process crashed:");
    console.error(err);
    exit(2);
  });
}
