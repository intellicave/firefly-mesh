// Stage 2.5 lite E2E — validate pivot detection without PIXELLAB_SECRET.
//
// Fetches the public south.png CDN URL for every external-library character
// in production-list.yaml, runs the same detectPivot() logic the download
// script uses, and asserts detected pivot is within ±2 px of the declared
// pivot. This regression-tests the full pivot pipeline using only public
// CDN URLs (no authenticated ZIP download).
//
// Full E2E (with animation frames + ZIP) requires PIXELLAB_SECRET and lives
// in download-pixellab-character.mjs.

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";

import sharp from "sharp";
import { parse as parseYaml } from "yaml";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, "..", "..", "..");
const PRODUCTION_LIST = join(REPO_ROOT, "docs", "art", "production-list.yaml");
const OWNER = "88880ad3-e106-42c0-8a79-192f3a4036ae";

const PIVOT_TOLERANCE_PX = 2;

async function fetchPng(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

async function detectPivot(buf, declared) {
  const meta = await sharp(buf).metadata();
  const W = meta.width;
  const H = meta.height;
  const raw = await sharp(buf).ensureAlpha().raw().toBuffer();

  let lowestRow = -1;
  for (let y = H - 1; y >= 0; y--) {
    for (let x = 0; x < W; x++) {
      if (raw[(y * W + x) * 4 + 3] > 127) {
        lowestRow = y;
        break;
      }
    }
    if (lowestRow !== -1) break;
  }
  if (lowestRow === -1) throw new Error("no opaque pixels");

  let sumX = 0;
  let count = 0;
  for (let y = Math.max(0, lowestRow - 1); y <= lowestRow; y++) {
    for (let x = 0; x < W; x++) {
      if (raw[(y * W + x) * 4 + 3] > 127) {
        sumX += x;
        count++;
      }
    }
  }
  const pivotX = Math.round(sumX / count);
  const pivotY = Math.min(H, lowestRow + 1);
  const drift = Math.sqrt((pivotX - declared.x) ** 2 + (pivotY - declared.y) ** 2);

  return { canvas: { w: W, h: H }, detected: { x: pivotX, y: pivotY }, drift, inTolerance: drift <= PIVOT_TOLERANCE_PX };
}

async function main() {
  const text = await readFile(PRODUCTION_LIST, "utf8");
  const prodList = parseYaml(text);
  const externals = (prodList.characters || []).filter((c) => c.status === "external-library");

  console.log(`Lite E2E — pivot validation for ${externals.length} chars`);
  console.log(
    "char-id".padEnd(34) +
      "canvas".padEnd(10) +
      "detected".padEnd(12) +
      "declared".padEnd(12) +
      "drift  verdict",
  );
  console.log("-".repeat(80));

  let pass = 0;
  let fail = 0;
  for (const c of externals) {
    try {
      const url = `https://backblaze.pixellab.ai/file/pixellab-characters/${OWNER}/${c.pixellab_id}/rotations/south.png`;
      const buf = await fetchPng(url);
      const r = await detectPivot(buf, c.pivot);
      // Verify canvas size matches declared.
      const sizeOK = r.canvas.w === c.size.w && r.canvas.h === c.size.h;

      const det = `(${r.detected.x},${r.detected.y})`;
      const dec = `(${c.pivot.x},${c.pivot.y})`;
      const verdict = r.inTolerance && sizeOK ? "PASS" : "FAIL";

      console.log(
        `${c.id.padEnd(34)}${`${r.canvas.w}×${r.canvas.h}`.padEnd(10)}${det.padEnd(12)}${dec.padEnd(12)}${r.drift.toFixed(1).padEnd(7)}${verdict}${sizeOK ? "" : "  size-mismatch"}`,
      );

      if (r.inTolerance && sizeOK) pass++;
      else fail++;
    } catch (err) {
      console.log(`${c.id.padEnd(34)}ERROR: ${err.message}`);
      fail++;
    }
  }

  console.log("-".repeat(80));
  console.log(`Result: ${pass} pass · ${fail} fail (tolerance ±${PIVOT_TOLERANCE_PX}px)`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
