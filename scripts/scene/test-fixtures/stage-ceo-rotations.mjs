// One-off staging script — fetch all 8 CEO rotation PNGs from public CDN
// into raw/char__firefly-ceo/rotations/, write pivot.json + source.json.
// Used for E2E testing the manifest builder without needing PIXELLAB_SECRET.
//
// Animations are NOT staged (those require auth). The manifest builder will
// note them as zero-frame and print a warning.

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const RAW = join(__dirname, "..", "raw", "char__firefly-ceo");
const ROT_DIR = join(RAW, "rotations");

const OWNER = "88880ad3-e106-42c0-8a79-192f3a4036ae";
const CEO = "2866ca4f-895d-4acc-af34-e061b767855e";
const DIRS = ["south", "south-east", "east", "north-east", "north", "north-west", "west", "south-west"];

async function fetchPng(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

async function main() {
  await mkdir(ROT_DIR, { recursive: true });

  let totalBytes = 0;
  for (const dir of DIRS) {
    const url = `https://backblaze.pixellab.ai/file/pixellab-characters/${OWNER}/${CEO}/rotations/${dir}.png`;
    const buf = await fetchPng(url);
    await writeFile(join(ROT_DIR, `${dir}.png`), buf);
    totalBytes += buf.length;
    console.log(`  ✓ rotations/${dir}.png (${(buf.length / 1024).toFixed(1)} KB)`);
  }

  // Write pivot.json (probed values).
  const pivotJson = {
    canvas: { w: 116, h: 116 },
    detected: { x: 58, y: 87 },
    declared: { x: 58, y: 87 },
    drift: 0,
    inTolerance: true,
    detectedFrom: "rotations/south.png",
    lowestOpaqueRow: 86,
  };
  await writeFile(join(RAW, "pivot.json"), JSON.stringify(pivotJson, null, 2) + "\n", "utf8");

  // Write source.json with a synthetic sha256.
  const fakeZip = createHash("sha256").update(`${CEO}-rotations-only`).digest("hex");
  const sourceJson = {
    char_id: "char/firefly-ceo",
    pixellab_id: CEO,
    downloaded_at: new Date().toISOString().slice(0, 10),
    sha256: fakeZip,
    png_count: DIRS.length,
    note: "Rotations-only stage (PIXELLAB_SECRET-free). Animations NOT included.",
  };
  await writeFile(join(RAW, "source.json"), JSON.stringify(sourceJson, null, 2) + "\n", "utf8");

  console.log(`\n✓ staged ${DIRS.length} rotations (${(totalBytes / 1024).toFixed(1)} KB total)`);
  console.log(`  raw dir: ${RAW}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
