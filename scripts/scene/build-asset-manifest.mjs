// Build public/scene/assets/manifest.json from processed/ + production-list.yaml.
//
// Manifest is the single contract that the BootScene loads at runtime. It
// includes a SHA-256 checksum so any drift between art and code triggers a
// hard "style update — refresh required" UX (per design.md § 3 R7).
//
// Atlases are NOT generated here (that's build-sprite-atlas.mjs). This script
// only builds manifest.json with declared atlas references.
//
// Usage:
//   node build-asset-manifest.mjs

import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir, readdir, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import YAML from "yaml";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, "..", "..");
const PRODUCTION_LIST = join(REPO_ROOT, "docs", "art", "production-list.yaml");
const PROCESSED_DIR = join(__dirname, "processed");
const PUBLIC_ASSETS = join(REPO_ROOT, "packages", "web", "public", "scene", "assets");

function idToFile(id) {
  return id.replace(/\//g, "__") + ".png";
}

async function fileExists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function sha256OfFile(path) {
  const h = createHash("sha256");
  h.update(await readFile(path));
  return h.digest("hex");
}

async function main() {
  const text = await readFile(PRODUCTION_LIST, "utf-8");
  const plist = YAML.parse(text);

  const manifest = {
    version: plist.version ?? "0.0.0",
    generatedAt: new Date().toISOString(),
    palette: "scene/assets/palette.png",
    atlases: {},
    foundation: {},
    characters: {},
    rooms: {},
    hallway: {},
    effects: {},
    icons: {},
    checksum: null, // filled in last
  };

  // Walk every section
  const sections = ["foundation", "characters", "rooms", "hallway", "effects", "icons"];
  let totalShipped = 0;
  let totalQueued = 0;

  for (const section of sections) {
    const entries = plist[section] ?? [];
    for (const entry of entries) {
      totalQueued++;
      const fname = idToFile(entry.id);
      const processedPath = join(PROCESSED_DIR, fname);
      if (!(await fileExists(processedPath))) continue;
      totalShipped++;

      manifest[section][entry.id] = {
        file: `scene/assets/${entry.type}/${fname}`,
        size: entry.size,
        pivot: entry.pivot ?? null,
        animations: entry.animations ?? null,
        directions: entry.directions ?? null,
        deskSlots: entry.desk_slots ?? null,
        doorway: entry.doorway ?? null,
      };
    }
  }

  // Compute checksum over the manifest body excluding the checksum field
  // AND excluding generatedAt — checksum must be content-deterministic
  // (same assets + production-list → same checksum, regardless of when run).
  const bodyForHash = JSON.stringify({
    ...manifest,
    checksum: undefined,
    generatedAt: undefined,
  });
  manifest.checksum = createHash("sha256").update(bodyForHash).digest("hex");

  await mkdir(PUBLIC_ASSETS, { recursive: true });
  const outPath = join(PUBLIC_ASSETS, "manifest.json");
  await writeFile(outPath, JSON.stringify(manifest, null, 2));

  console.log(`✓ wrote ${outPath}`);
  console.log(`  ${totalShipped}/${totalQueued} assets shipped`);
  console.log(`  checksum: ${manifest.checksum.slice(0, 16)}...`);
}

main().catch((err) => {
  console.error("✗ build-asset-manifest crashed:");
  console.error(err);
  process.exit(1);
});
