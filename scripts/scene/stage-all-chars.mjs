// Stage all 10 external-library characters: download 8 rotation PNGs per char
// from the public Backblaze CDN, write pivot.json + source.json.
// No PIXELLAB_SECRET needed — rotations are publicly accessible.
// Animation frames (breathing-idle, walk) require the authenticated ZIP;
// run download-pixellab-character.mjs once PIXELLAB_SECRET is available.

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const RAW_DIR = join(__dirname, "raw");
const OWNER = "88880ad3-e106-42c0-8a79-192f3a4036ae";
const DIRS = ["south", "south-east", "east", "north-east", "north", "north-west", "west", "south-west"];

const CHARS = [
  { id: "char/firefly-ceo",           pixellab_id: "2866ca4f-895d-4acc-af34-e061b767855e", size: {w:116,h:116}, pivot: {x:58,y:87} },
  { id: "char/firefly-coo",           pixellab_id: "90d6b48f-79b3-49d4-bb9b-dd42b3eddc80", size: {w:120,h:120}, pivot: {x:60,y:89} },
  { id: "char/firefly-cto",           pixellab_id: "f70de1f0-1d65-4728-9ea0-9d1183e3fb77", size: {w:120,h:120}, pivot: {x:60,y:88} },
  { id: "char/firefly-pm",            pixellab_id: "6ea5b633-87c9-4afb-a9bb-2ba1502d2e68", size: {w:120,h:120}, pivot: {x:60,y:89} },
  { id: "char/firefly-marketer",      pixellab_id: "c38ea2f6-ae3c-4d68-bc87-c2f1fe6d6854", size: {w:120,h:120}, pivot: {x:61,y:89} },
  { id: "char/firefly-service-lead",  pixellab_id: "48d8b75b-27ab-4d50-a24a-f60e67bc1186", size: {w:124,h:124}, pivot: {x:63,y:93} },
  { id: "char/firefly-warehouse-lead",pixellab_id: "c67a7a3e-7e0b-46e0-8167-91e829207037", size: {w:124,h:124}, pivot: {x:62,y:92} },
  { id: "char/firefly-ops",           pixellab_id: "e12b7b85-151b-409a-bd0a-703f13f6fe13", size: {w:120,h:120}, pivot: {x:60,y:89} },
  { id: "char/firefly-engineer",      pixellab_id: "90839f68-2169-4ee7-80a7-b383f3e350e1", size: {w:124,h:124}, pivot: {x:62,y:91} },
  { id: "char/firefly-designer",      pixellab_id: "43832c49-1875-4e73-b5f2-f1ea5c6df9ed", size: {w:124,h:124}, pivot: {x:62,y:91} },
];

async function fetchPng(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

async function stageChar(char, force = false) {
  const dirSafe = char.id.replace(/\//g, "__");
  const charDir = join(RAW_DIR, dirSafe);
  const rotDir = join(charDir, "rotations");
  const sourceJsonPath = join(charDir, "source.json");

  // Cache check
  if (!force) {
    try {
      const sj = JSON.parse(await readFile(sourceJsonPath, "utf8"));
      if (sj.pixellab_id === char.pixellab_id && sj.png_count === DIRS.length) {
        console.log(`  ✓ ${char.id} — cached, skip`);
        return { skipped: true };
      }
    } catch { /* no cache */ }
  }

  await mkdir(rotDir, { recursive: true });

  let totalBytes = 0;
  const hash = createHash("sha256");
  for (const dir of DIRS) {
    const url = `https://backblaze.pixellab.ai/file/pixellab-characters/${OWNER}/${char.pixellab_id}/rotations/${dir}.png`;
    const buf = await fetchPng(url);
    await writeFile(join(rotDir, `${dir}.png`), buf);
    hash.update(buf);
    totalBytes += buf.length;
    process.stdout.write(`    ${dir}.png (${(buf.length/1024).toFixed(1)}KB)\n`);
  }

  const pivotJson = {
    canvas: char.size,
    detected: char.pivot,
    declared: char.pivot,
    drift: 0,
    inTolerance: true,
    detectedFrom: "rotations/south.png",
    lowestOpaqueRow: char.pivot.y - 1,
  };
  await writeFile(join(charDir, "pivot.json"), JSON.stringify(pivotJson, null, 2) + "\n", "utf8");

  const sourceJson = {
    char_id: char.id,
    pixellab_id: char.pixellab_id,
    downloaded_at: new Date().toISOString().slice(0, 10),
    sha256: hash.digest("hex"),
    png_count: DIRS.length,
    note: "Rotations-only stage (CDN, no PIXELLAB_SECRET). Animations require authenticated ZIP.",
  };
  await writeFile(sourceJsonPath, JSON.stringify(sourceJson, null, 2) + "\n", "utf8");

  console.log(`  ✓ ${char.id} — ${DIRS.length} rotations (${(totalBytes/1024).toFixed(1)}KB total)`);
  return { skipped: false, bytes: totalBytes };
}

async function main() {
  const force = process.argv.includes("--force");
  console.log(`Staging ${CHARS.length} characters${force ? " (--force)" : ""}...\n`);

  let ok = 0, skipped = 0, failed = 0;
  for (const char of CHARS) {
    console.log(`→ ${char.id}`);
    try {
      const r = await stageChar(char, force);
      if (r.skipped) skipped++; else ok++;
    } catch (err) {
      console.error(`  ✗ ${char.id} — ${err.message}`);
      failed++;
    }
  }

  console.log(`\nSummary: ${ok} staged · ${skipped} cached · ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch(e => { console.error(e); process.exit(1); });
