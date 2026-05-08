// Generate docs/art/palette.png — the master 32×1 palette PNG.
//
// This file is the SINGLE SOURCE OF TRUTH for every art asset's colour budget.
// Running this script must be byte-deterministic: same palette.mjs → same PNG.
//
// Usage:
//   pnpm --filter @firefly-mesh/scene-tools build:palette
//
// QA gate (asset-validate) loads this file and verifies asset palettes
// are subsets of these colours.

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir, writeFile } from "node:fs/promises";

import sharp from "sharp";

import { PALETTE_RGB, PALETTE_HEX } from "./palette.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, "..", "..");
const OUT_PATH = join(REPO_ROOT, "docs", "art", "palette.png");

async function main() {
  const width = PALETTE_RGB.length; // 32
  const height = 1;

  // Build raw RGBA buffer
  const raw = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width; i++) {
    const [r, g, b] = PALETTE_RGB[i];
    raw[i * 4 + 0] = r;
    raw[i * 4 + 1] = g;
    raw[i * 4 + 2] = b;
    raw[i * 4 + 3] = 255;
  }

  await mkdir(dirname(OUT_PATH), { recursive: true });

  await sharp(raw, {
    raw: { width, height, channels: 4 },
  })
    // Force PNG-8 indexed mode with no alpha channel for byte-determinism +
    // smallest-possible footprint. sharp uses libvips, which writes PNGs
    // in a deterministic byte-order so re-runs produce identical files.
    .png({
      palette: true,
      compressionLevel: 9,
      effort: 10,
    })
    .toFile(OUT_PATH);

  // Print a human-readable summary
  console.log(`✓ wrote ${OUT_PATH}`);
  console.log(`  ${width} colours × ${height} px`);
  console.log(`  ramps:`);
  const RAMP_NAMES = [
    "neutrals",
    "warm-brown",
    "orange",
    "yellow",
    "green",
    "blue",
    "purple",
    "red",
  ];
  for (let i = 0; i < 8; i++) {
    const slice = PALETTE_HEX.slice(i * 4, i * 4 + 4).join("  ");
    console.log(`    ramp ${i} (${RAMP_NAMES[i].padEnd(11)}): ${slice}`);
  }
}

main().catch((err) => {
  console.error("✗ build-palette-png failed:");
  console.error(err);
  process.exit(1);
});
