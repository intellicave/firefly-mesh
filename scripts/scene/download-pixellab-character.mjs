// Stage 2.3 — Download existing PixelLab firefly-folk characters into raw/.
//
// Per art-bible v3.0 §3.2 and rules R20: V1 characters source from the
// user's already-curated PixelLab library — no new generations. This
// script reads `production-list.yaml`, finds entries with status =
// "external-library", and downloads each character's pack via the
// PixelLab REST API (or alternative MCP-bridged URL).
//
// Output structure (per character):
//   scripts/scene/raw/<char-id>/
//     ├─ rotations/<dir>.png         (8 static-pose PNGs)
//     ├─ animations/<anim>-<dir>/<frame>.png
//     ├─ pivot.json                  ({ x, y, detected_from: "south.png" })
//     └─ source.json                 ({ pixellab_id, downloaded_at, sha256 })
//
// Pivot auto-detection (HR15 v3.0):
//   - Read the south rotation PNG; find lowest non-transparent pixel row Yb
//   - Find centre column of the bottom band: average x of all non-transparent
//     pixels in row Yb (or rows [Yb-1, Yb] for noise resilience)
//   - Pivot = (round(meanX), Yb + 1 OR Yb if rhombus extends to edge)
//   - Verify within ±2 px of canvas-bottom-centre (expected pivot per spec)
//
// Authentication:
//   - PIXELLAB_SECRET env var (Bearer token)
//   - Get one at https://api.pixellab.ai/mcp
//   - If unset, script exits with a clear instruction
//
// Cache:
//   - Per-character `source.json` records the pixellab_id + sha256 of the
//     downloaded ZIP. Re-runs check the file; if pixellab_id matches AND a
//     `--force` flag was NOT passed, the script skips the download.
//
// Usage:
//   PIXELLAB_SECRET=… node download-pixellab-character.mjs              # all external chars
//   PIXELLAB_SECRET=… node download-pixellab-character.mjs <char-id>    # single char
//   PIXELLAB_SECRET=… node download-pixellab-character.mjs --force      # force refresh

import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import AdmZip from "adm-zip";
import sharp from "sharp";
import { parse as parseYaml } from "yaml";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, "..", "..");
const PRODUCTION_LIST = join(REPO_ROOT, "docs", "art", "production-list.yaml");
const RAW_DIR = join(__dirname, "raw");

// PixelLab v2 API base. Per docs: GET /v2/characters/{id}/zip downloads
// the full character pack (rotations + animations).
const PIXELLAB_BASE = "https://api.pixellab.ai/v2";

// HR15 v3.0 — pivot must be within ±2 px of expected canvas-bottom-centre.
const PIVOT_TOLERANCE_PX = 2;

function sha256(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

async function readProductionList() {
  const text = await readFile(PRODUCTION_LIST, "utf8");
  return parseYaml(text);
}

function pickCharacters(prodList, requestedId) {
  const all = prodList.characters || [];
  const externals = all.filter((c) => c.status === "external-library");
  if (requestedId) {
    const one = externals.find((c) => c.pixellab_id === requestedId || c.id === requestedId);
    return one ? [one] : [];
  }
  return externals;
}

async function downloadZip(pixellabId, secret) {
  const url = `${PIXELLAB_BASE}/characters/${pixellabId}/zip`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${secret}` },
  });
  if (!res.ok) {
    if (res.status === 423) {
      const body = await res.text();
      throw new Error(`HTTP 423: animations pending for ${pixellabId} — ${body}`);
    }
    throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

// Extract ZIP entries that are PNG files into the per-character raw dir.
// Returns an array of relative paths actually written.
function extractZip(zipBuf, outDir) {
  const zip = new AdmZip(zipBuf);
  const entries = zip.getEntries();
  const written = [];
  for (const entry of entries) {
    if (entry.isDirectory) continue;
    if (!entry.entryName.toLowerCase().endsWith(".png")) continue;
    const dest = join(outDir, entry.entryName);
    zip.extractEntryTo(entry, dirname(dest), /*maintain*/ false, /*overwrite*/ true);
    written.push(entry.entryName);
  }
  return written;
}

// Auto-detect pivot (feet-centre) on the south-facing rotation PNG.
//
// Algorithm:
//   1. Find the lowest row Yb that contains any opaque pixel (alpha > 127).
//      This is the bottom of the visible character / shadow.
//   2. Average x of opaque pixels in rows [Yb-1, Yb] → meanX (noise-resilient).
//   3. Pivot = (round(meanX), Yb + 1)  — one row below the lowest opaque
//      pixel, where the y-sort reference point sits.
//
// The caller passes the *declared* pivot from production-list.yaml; we
// compare detected vs declared and flag drift > PIVOT_TOLERANCE_PX.
async function detectPivot(southPngPath, declaredPivot) {
  const meta = await sharp(southPngPath).metadata();
  const W = meta.width;
  const H = meta.height;
  const raw = await sharp(southPngPath).ensureAlpha().raw().toBuffer();

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
  if (lowestRow === -1) {
    throw new Error(`No opaque pixels found in ${southPngPath}`);
  }

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
  const meanX = Math.round(sumX / count);
  const pivotY = Math.min(H, lowestRow + 1);
  const pivotX = meanX;

  const drift = Math.sqrt(
    (pivotX - declaredPivot.x) ** 2 + (pivotY - declaredPivot.y) ** 2,
  );
  const inTolerance = drift <= PIVOT_TOLERANCE_PX;

  return {
    canvas: { w: W, h: H },
    detected: { x: pivotX, y: pivotY },
    declared: { x: declaredPivot.x, y: declaredPivot.y },
    drift,
    inTolerance,
    detectedFrom: southPngPath,
    lowestOpaqueRow: lowestRow,
  };
}

async function processCharacter(entry, secret, force) {
  const charId = entry.id; // e.g. "char/firefly-ceo"
  const pixellabId = entry.pixellab_id;
  const dirSafe = charId.replace(/\//g, "__");
  const outDir = join(RAW_DIR, dirSafe);
  const sourceJsonPath = join(outDir, "source.json");

  console.log(`\n→ ${charId}  (pixellab_id ${pixellabId})`);

  // Cache check.
  if (!force) {
    try {
      const sj = JSON.parse(await readFile(sourceJsonPath, "utf8"));
      if (sj.pixellab_id === pixellabId) {
        console.log(`  ✓ cached (sha256 ${sj.sha256.slice(0, 12)}…) — skip`);
        return { charId, skipped: true };
      }
    } catch (_e) {
      // No cache → proceed.
    }
  }

  // Wipe outDir for a clean slate (avoid stale files when source moves).
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  // Fetch ZIP.
  console.log(`  ↓ downloading ${PIXELLAB_BASE}/characters/${pixellabId}/zip`);
  const zipBuf = await downloadZip(pixellabId, secret);
  const zipSha = sha256(zipBuf);
  console.log(`  ✓ ${(zipBuf.length / 1024).toFixed(1)} KB, sha256 ${zipSha.slice(0, 12)}…`);

  // Extract.
  const written = extractZip(zipBuf, outDir);
  console.log(`  ✓ extracted ${written.length} PNG(s)`);

  // Find a south-facing rotation PNG to use for pivot detection.
  // PixelLab v2 ZIP organisation is not publicly documented; we try several
  // common patterns.
  let southPng = null;
  const candidates = [
    "rotations/south.png",
    "rotations/south_0.png",
    "south.png",
    "south_0.png",
  ];
  for (const rel of candidates) {
    const p = join(outDir, rel);
    try {
      await readFile(p);
      southPng = p;
      break;
    } catch (_e) {
      // try next
    }
  }
  if (!southPng) {
    // Fall back to any PNG with "south" in name.
    const pngsWithSouth = written.filter((p) =>
      p.toLowerCase().includes("south") && !p.toLowerCase().includes("south-east") && !p.toLowerCase().includes("south-west"),
    );
    if (pngsWithSouth.length > 0) {
      southPng = join(outDir, pngsWithSouth[0]);
    }
  }
  if (!southPng) {
    throw new Error(
      `Could not find south rotation PNG in ${outDir}. Inspect the extracted directory and update download-pixellab-character.mjs candidate list.`,
    );
  }

  // Pivot detect — compare against production-list declared pivot.
  if (!entry.pivot) {
    throw new Error(
      `${charId} has no declared pivot in production-list.yaml; downloader cannot validate HR15 without it`,
    );
  }
  const pivot = await detectPivot(southPng, entry.pivot);
  console.log(
    `  pivot: detected (${pivot.detected.x},${pivot.detected.y}) declared (${pivot.declared.x},${pivot.declared.y}) drift ${pivot.drift.toFixed(2)}px [${pivot.inTolerance ? "OK" : "DRIFT"}]`,
  );
  await writeFile(
    join(outDir, "pivot.json"),
    JSON.stringify(pivot, null, 2) + "\n",
    "utf8",
  );

  // Sidecar metadata.
  await writeFile(
    sourceJsonPath,
    JSON.stringify(
      {
        char_id: charId,
        pixellab_id: pixellabId,
        downloaded_at: new Date().toISOString().slice(0, 10), // date-only for byte determinism re-runs (intentionally non-deterministic for genuine refreshes)
        sha256: zipSha,
        png_count: written.length,
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );

  if (!pivot.inTolerance) {
    throw new Error(
      `HR15: pivot drift ${pivot.drift.toFixed(2)} px > tolerance ${PIVOT_TOLERANCE_PX} px for ${charId}`,
    );
  }

  return { charId, skipped: false, pngCount: written.length, pivot };
}

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const positional = args.filter((a) => !a.startsWith("--"));
  const requestedId = positional[0];

  const secret = process.env.PIXELLAB_SECRET;
  if (!secret) {
    console.error(
      "✗ PIXELLAB_SECRET env var is required.\n" +
        "  Get a token at https://api.pixellab.ai/mcp and re-run:\n" +
        "    PIXELLAB_SECRET=… pnpm --filter @firefly-mesh/scene-tools download:characters",
    );
    process.exit(2);
  }

  const prodList = await readProductionList();
  const targets = pickCharacters(prodList, requestedId);
  if (targets.length === 0) {
    console.error(
      requestedId
        ? `✗ no external-library character matches "${requestedId}"`
        : `✗ no external-library characters in ${PRODUCTION_LIST}`,
    );
    process.exit(2);
  }

  console.log(
    `Downloading ${targets.length} character(s) into ${RAW_DIR}${force ? " (--force)" : ""}`,
  );

  let ok = 0;
  let skipped = 0;
  let failed = 0;
  for (const entry of targets) {
    try {
      const r = await processCharacter(entry, secret, force);
      if (r.skipped) skipped++;
      else ok++;
    } catch (err) {
      console.error(`  ✗ ${entry.id} — ${err.message}`);
      failed++;
    }
  }

  console.log(
    `\nSummary: ${ok} downloaded · ${skipped} cached · ${failed} failed`,
  );
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("✗ download-pixellab-character crashed:");
  console.error(err);
  process.exit(1);
});
