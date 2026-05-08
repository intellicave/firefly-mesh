// Build public/scene/assets/manifest.json from processed/ + raw/ + production-list.yaml.
//
// Manifest is the single contract that the BootScene loads at runtime. It
// includes a SHA-256 checksum so any drift between art and code triggers a
// hard "style update — refresh required" UX (per design.md § 3 R7).
//
// V3.0 additions:
//   - `tiles` section replaces `rooms` + `hallway`.
//   - External-library characters (status=external-library): pulled from
//     `scripts/scene/raw/<char-id>/`. Each manifest entry contains:
//       - pixellab_id
//       - canvas size + detected pivot (from raw/<char-id>/pivot.json)
//       - per-anim/dir frame URIs grouped under `frames`
//       - `shadow_baked: true` (R16 v3.0 — external sprites have shadow
//         baked in, engine MUST NOT composite a runtime shadow)
//       - `lantern_palette` (ramp-3 hex codes used by LanternOverlaySystem
//         to detect which pixels to tint per state)
//
// Atlases are NOT generated here (that's build-sprite-atlas.mjs). This
// script only builds manifest.json with declared atlas references.
//
// Usage:
//   node build-asset-manifest.mjs

import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir, readdir, stat } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import YAML from "yaml";

import { PALETTE_HEX } from "./palette.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, "..", "..");
const PRODUCTION_LIST = join(REPO_ROOT, "docs", "art", "production-list.yaml");
const PROCESSED_DIR = join(__dirname, "processed");
const RAW_DIR = join(__dirname, "raw");
const PUBLIC_ASSETS = join(REPO_ROOT, "packages", "web", "public", "scene", "assets");

// Ramp 3 (yellow) — used by LanternOverlaySystem at runtime to detect which
// pixels in a char sprite belong to the lantern abdomen and need to be tinted
// per state (idle pulse / walk steady / work dim+burst / talk double-pulse).
const LANTERN_PALETTE = PALETTE_HEX.slice(12, 16); // ramp 3 indices 12-15

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

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf-8"));
}

// Normalise a relative file path to a forward-slash URI for manifest.
function toUri(relPath) {
  return relPath.split(/[\\/]/).join("/");
}

// Walk raw/<char-id>/ recursively, collect all .png files under the char dir.
async function collectCharFrames(charDir) {
  const out = [];
  async function walk(dir, prefix) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const abs = join(dir, e.name);
      const rel = prefix ? `${prefix}/${e.name}` : e.name;
      if (e.isDirectory()) {
        await walk(abs, rel);
      } else if (e.isFile() && e.name.toLowerCase().endsWith(".png")) {
        out.push({ rel, abs });
      }
    }
  }
  await walk(charDir, "");
  return out;
}

// Extract (animation, direction) from a frame's relative path within a char
// dir. Best-effort heuristic: PixelLab ZIP layouts vary, so we try several
// common patterns. Frames whose path can't be parsed are placed in
// "rotations" or "uncategorised".
const DIR_TOKENS = [
  ["south-east", "se"],
  ["south-west", "sw"],
  ["north-east", "ne"],
  ["north-west", "nw"],
  ["south", "s"],
  ["north", "n"],
  ["east", "e"],
  ["west", "w"],
];

function classifyFrame(relPath) {
  const lower = relPath.toLowerCase();
  let animation = null;
  let direction = null;
  let frameIndex = null;

  // Direction
  for (const [token, key] of DIR_TOKENS) {
    if (lower.includes(token)) {
      direction = key;
      break;
    }
  }

  // Animation — common tokens
  if (lower.includes("breathing-idle") || lower.includes("idle")) {
    animation = "idle";
  } else if (lower.includes("walk")) {
    animation = "walk";
  } else if (lower.startsWith("rotations/") || lower.includes("/rotations/")) {
    animation = "rotation";
  }

  // Frame index — last numeric token before .png
  const m = /(\d+)\.png$/.exec(lower);
  if (m) frameIndex = parseInt(m[1], 10);

  return { animation, direction, frameIndex };
}

function groupFrames(frames) {
  // group[anim][dir] = [frame uri, ...] sorted by frameIndex
  const group = {};
  const uncategorised = [];
  for (const f of frames) {
    const { animation, direction, frameIndex } = classifyFrame(f.rel);
    if (!animation || !direction) {
      uncategorised.push(f.rel);
      continue;
    }
    group[animation] ??= {};
    group[animation][direction] ??= [];
    group[animation][direction].push({ rel: f.rel, frameIndex: frameIndex ?? 0 });
  }
  // Sort each direction's frames by frameIndex.
  for (const anim of Object.keys(group)) {
    for (const dir of Object.keys(group[anim])) {
      group[anim][dir].sort((a, b) => a.frameIndex - b.frameIndex);
      group[anim][dir] = group[anim][dir].map((f) => f.rel);
    }
  }
  return { frames: group, uncategorised };
}

async function buildExternalCharEntry(entry) {
  const dirSafe = entry.id.replace(/\//g, "__");
  const charRawDir = join(RAW_DIR, dirSafe);

  if (!(await fileExists(charRawDir))) {
    return {
      id: entry.id,
      shipped: false,
      reason: "raw/ dir missing — run download-pixellab-character.mjs first",
    };
  }

  // Detected pivot
  let detectedPivot = entry.pivot;
  let source = null;
  try {
    const pivotJson = await readJson(join(charRawDir, "pivot.json"));
    if (pivotJson.detected) detectedPivot = pivotJson.detected;
  } catch (_e) {
    // fall back to declared
  }
  try {
    source = await readJson(join(charRawDir, "source.json"));
  } catch (_e) {
    // ok if missing
  }

  // Frames
  const collected = await collectCharFrames(charRawDir);
  const { frames, uncategorised } = groupFrames(collected);

  // Total frame count (idle + walk per dir).
  let totalFrames = 0;
  for (const anim of Object.keys(frames)) {
    for (const dir of Object.keys(frames[anim])) {
      totalFrames += frames[anim][dir].length;
    }
  }

  return {
    id: entry.id,
    shipped: true,
    body: {
      pixellab_id: entry.pixellab_id,
      size: entry.size,
      pivot: detectedPivot,
      directions: entry.directions ?? null,
      role_mapping: entry.role_mapping ?? null,
      department: entry.department ?? null,
      role_branch: entry.role_branch ?? null,
      // Frames are the engine-side payload. Path is relative to raw/<char-id>/.
      frames: frames,
      total_frames: totalFrames,
      shadow_baked: true, // R16 v3.0 — external sprites have baked shadow
      lantern_palette: LANTERN_PALETTE,
      source: source,
      uncategorised_frames: uncategorised.length > 0 ? uncategorised : undefined,
    },
  };
}

async function main() {
  const text = await readFile(PRODUCTION_LIST, "utf-8");
  const plist = YAML.parse(text);

  const manifest = {
    version: plist.version ?? "0.0.0",
    generatedAt: new Date().toISOString(),
    palette: "scene/assets/palette.png",
    iso_grid_reference: "scene/assets/iso-grid-reference.png",
    atlases: {},
    foundation: {},
    characters: {},
    tiles: {},
    effects: {},
    icons: {},
    checksum: null,
  };

  let totalShipped = 0;
  let totalQueued = 0;

  // Foundation, tiles, effects, icons — single-PNG entries from processed/.
  const singleSections = ["foundation", "tiles", "effects", "icons"];
  for (const section of singleSections) {
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
        anchor: entry.anchor ?? null,
        attached: entry.attached ?? null,
        animations: entry.animations ?? null,
        directions: entry.directions ?? null,
      };
    }
  }

  // Characters — external-library entries from raw/<char-id>/.
  const charEntries = plist.characters ?? [];
  for (const entry of charEntries) {
    totalQueued++;
    if (entry.status !== "external-library") {
      // V0.2+ may add internally-generated chars; pipeline TBD.
      continue;
    }
    const built = await buildExternalCharEntry(entry);
    if (built.shipped) {
      manifest.characters[entry.id] = built.body;
      totalShipped++;
    }
  }

  // Compute checksum excluding the checksum field AND generatedAt.
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
