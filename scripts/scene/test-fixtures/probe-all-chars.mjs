// Probe all 10 firefly-folk south.png rotations to discover the actual
// per-character pivot. Updates the production-list.yaml's expected pivot
// fields based on real measurement.
//
// CDN URL pattern (public, no auth):
//   https://backblaze.pixellab.ai/file/pixellab-characters/<owner-id>/<char-id>/rotations/south.png

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFile } from "node:fs/promises";

import sharp from "sharp";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const OUT_DIR = __dirname;
const OWNER = "88880ad3-e106-42c0-8a79-192f3a4036ae";

const CHARS = [
  { id: "char/firefly-ceo",            uuid: "2866ca4f-895d-4acc-af34-e061b767855e", expected_size: 116 },
  { id: "char/firefly-coo",            uuid: "90d6b48f-79b3-49d4-bb9b-dd42b3eddc80", expected_size: 120 },
  { id: "char/firefly-cto",            uuid: "f70de1f0-1d65-4728-9ea0-9d1183e3fb77", expected_size: 120 },
  { id: "char/firefly-pm",             uuid: "6ea5b633-87c9-4afb-a9bb-2ba1502d2e68", expected_size: 120 },
  { id: "char/firefly-marketer",       uuid: "c38ea2f6-ae3c-4d68-bc87-c2f1fe6d6854", expected_size: 120 },
  { id: "char/firefly-service-lead",   uuid: "48d8b75b-27ab-4d50-a24a-f60e67bc1186", expected_size: 124 },
  { id: "char/firefly-warehouse-lead", uuid: "c67a7a3e-7e0b-46e0-8167-91e829207037", expected_size: 124 },
  { id: "char/firefly-ops",            uuid: "e12b7b85-151b-409a-bd0a-703f13f6fe13", expected_size: 120 },
  { id: "char/firefly-engineer",       uuid: "90839f68-2169-4ee7-80a7-b383f3e350e1", expected_size: 124 },
  { id: "char/firefly-designer",       uuid: "43832c49-1875-4e73-b5f2-f1ea5c6df9ed", expected_size: 124 },
];

async function fetchPng(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

async function detectPivot(buf) {
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
  const meanX = Math.round(sumX / count);
  const pivotY = Math.min(H, lowestRow + 1);
  const pivotX = meanX;

  return { canvas: { w: W, h: H }, pivot: { x: pivotX, y: pivotY }, lowestRow };
}

async function main() {
  console.log(`Probing ${CHARS.length} characters in parallel ...`);
  const results = await Promise.all(
    CHARS.map(async (c) => {
      try {
        const url = `https://backblaze.pixellab.ai/file/pixellab-characters/${OWNER}/${c.uuid}/rotations/south.png`;
        const buf = await fetchPng(url);
        const r = await detectPivot(buf);
        return { ...c, ...r, ok: true };
      } catch (err) {
        return { ...c, ok: false, error: err.message };
      }
    }),
  );

  console.log("\nResults:");
  console.log(
    "char-id".padEnd(34) +
      "canvas".padEnd(10) +
      "lowest-row".padEnd(12) +
      "pivot",
  );
  console.log("-".repeat(70));
  for (const r of results) {
    if (!r.ok) {
      console.log(`${r.id.padEnd(34)}ERROR: ${r.error}`);
      continue;
    }
    const canvas = `${r.canvas.w}×${r.canvas.h}`;
    console.log(
      `${r.id.padEnd(34)}${canvas.padEnd(10)}${String(r.lowestRow).padEnd(12)}(${r.pivot.x},${r.pivot.y})`,
    );
  }

  const out = results.filter((r) => r.ok).map((r) => ({
    id: r.id,
    pixellab_id: r.uuid,
    size: { w: r.canvas.w, h: r.canvas.h },
    pivot: r.pivot,
    lowest_opaque_row: r.lowestRow,
  }));
  await writeFile(
    join(OUT_DIR, "char-pivots.json"),
    JSON.stringify(out, null, 2) + "\n",
    "utf8",
  );
  console.log(`\n✓ wrote char-pivots.json (${out.length} entries)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
