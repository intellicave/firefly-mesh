// Asset QA gate — runs before any PNG is accepted into public/scene/assets/.
//
// Per docs/art/firefly-mesh-art-bible.md § 11 hard rules + docs/plans/.../rules.md
// R1, R2, R9, R15, R16. Each violation is a merge blocker.
//
// Usage:
//   node validate-asset-qa.mjs <png-path> [--spec='{"size":{"w":16,"h":24},"pivot":{"x":8,"y":24},"type":"character"}']
//
// Or programmatically: import { validateAsset } from "./validate-asset-qa.mjs"
//
// Returns 0 on pass, 1 on any failure. Prints all failures (does not stop at first).

import { readFile } from "node:fs/promises";
import { argv, exit } from "node:process";

import sharp from "sharp";

import { PALETTE_RGB } from "./palette.mjs";

/** Build set of "rrggbb" lower-case hex strings for fast membership. */
function paletteSet() {
  const set = new Set();
  for (const [r, g, b] of PALETTE_RGB) {
    const h =
      r.toString(16).padStart(2, "0") +
      g.toString(16).padStart(2, "0") +
      b.toString(16).padStart(2, "0");
    set.add(h);
  }
  return set;
}

const PALETTE_SET = paletteSet();
const OUTLINE_COLOUR = "1a1226"; // ramp 0 darkest

/**
 * Validate a single PNG against the asset spec.
 *
 * @param {string} path  - file path to the PNG
 * @param {object} spec  - { size: {w, h}, pivot?: {x, y}, type: "character"|"room"|"effect"|"icon"|"tile"|"palette" }
 * @returns {Promise<{ok: boolean, errors: string[], warnings: string[]}>}
 */
export async function validateAsset(path, spec) {
  const errors = [];
  const warnings = [];

  // Load raw RGBA
  const buf = await readFile(path);
  const img = sharp(buf);
  const meta = await img.metadata();

  // ── 1. Dimensions ─────────────────────────────────────────────────
  if (spec.size) {
    if (meta.width !== spec.size.w) {
      errors.push(
        `width ${meta.width} ≠ expected ${spec.size.w} (declared in production-list)`,
      );
    }
    if (meta.height !== spec.size.h) {
      errors.push(
        `height ${meta.height} ≠ expected ${spec.size.h} (declared in production-list)`,
      );
    }
  }

  // Get raw pixels
  const { data, info } = await img
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const W = info.width;
  const H = info.height;
  const channels = info.channels;
  if (channels !== 4) {
    errors.push(`expected 4 channels (RGBA), got ${channels}`);
    return { ok: false, errors, warnings };
  }

  // ── 2. Palette membership + 3. partial-alpha + 4. outline colour ──
  const offendingColours = new Set();
  let partialAlphaPixels = 0;
  let opaquePixels = 0;
  let outlineLikePixels = 0; // dark pixels at the colour of outline
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];

    if (a === 0) continue; // fully transparent — skip
    if (a !== 255) {
      partialAlphaPixels++;
      continue;
    }
    opaquePixels++;

    const hex =
      r.toString(16).padStart(2, "0") +
      g.toString(16).padStart(2, "0") +
      b.toString(16).padStart(2, "0");

    if (!PALETTE_SET.has(hex)) {
      offendingColours.add(`#${hex}`);
    }
    if (hex === OUTLINE_COLOUR) outlineLikePixels++;
  }

  // 2. palette membership
  if (offendingColours.size > 0) {
    const sample = [...offendingColours].slice(0, 10).join(", ");
    errors.push(
      `${offendingColours.size} non-palette colour(s) detected. ` +
        `Sample: ${sample}${offendingColours.size > 10 ? ", …" : ""}. ` +
        `Asset must be quantized to docs/art/palette.png.`,
    );
  }

  // 3. partial-alpha
  if (partialAlphaPixels > 0) {
    errors.push(
      `${partialAlphaPixels} partial-alpha pixel(s) detected. ` +
        `Stardew style requires hard outlines: every pixel must be alpha=0 or alpha=255.`,
    );
  }

  // 4. outline existence (warning, not error — small icons may have no outline)
  if (
    spec.type !== "palette" &&
    spec.type !== "icon" &&
    opaquePixels > 0 &&
    outlineLikePixels === 0
  ) {
    warnings.push(
      `no outline-coloured pixels (${OUTLINE_COLOUR}) found. Most assets need a 1px black outline.`,
    );
  }

  // ── 5. Pivot point (characters / objects) ─────────────────────────
  if (spec.pivot) {
    const { x, y } = spec.pivot;
    if (x < 0 || x >= W || y < 0 || y >= H) {
      errors.push(`pivot (${x},${y}) is outside image bounds ${W}×${H}`);
    } else {
      // Pivot is encoded as a transparent dot at (x, y).
      // Tolerance: ±1 px in either direction.
      let found = false;
      for (let dy = -1; dy <= 1 && !found; dy++) {
        for (let dx = -1; dx <= 1 && !found; dx++) {
          const px = x + dx;
          const py = y + dy;
          if (px < 0 || px >= W || py < 0 || py >= H) continue;
          const idx = (py * W + px) * 4;
          if (data[idx + 3] === 0) found = true;
        }
      }
      if (!found) {
        errors.push(
          `pivot point at (${x},${y}) not detected ` +
            `(expected a transparent pixel within ±1 px of declared pivot)`,
        );
      }
    }
  }

  // ── 6. Type-specific checks ───────────────────────────────────────
  if (spec.type === "palette") {
    if (W !== 32 || H !== 1) {
      errors.push(`palette must be 32×1, got ${W}×${H}`);
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}

/** CLI entry. */
async function cli() {
  const args = argv.slice(2);
  const path = args[0];
  if (!path) {
    console.error("usage: validate-asset-qa.mjs <png-path> [--spec=<json>]");
    exit(2);
  }
  let spec = { type: "unknown" };
  for (const a of args) {
    if (a.startsWith("--spec=")) {
      spec = JSON.parse(a.slice("--spec=".length));
    }
  }

  const result = await validateAsset(path, spec);
  if (result.warnings.length > 0) {
    console.warn(`⚠ ${path} — ${result.warnings.length} warning(s):`);
    for (const w of result.warnings) console.warn(`  • ${w}`);
  }
  if (result.ok) {
    console.log(`✓ ${path}`);
    exit(0);
  } else {
    console.error(`✗ ${path} — ${result.errors.length} error(s):`);
    for (const e of result.errors) console.error(`  • ${e}`);
    exit(1);
  }
}

if (import.meta.url === `file://${argv[1].replace(/\\/g, "/")}` || argv[1].endsWith("validate-asset-qa.mjs")) {
  cli().catch((err) => {
    console.error("✗ validate-asset-qa crashed:");
    console.error(err);
    exit(2);
  });
}
