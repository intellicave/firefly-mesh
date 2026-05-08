// Asset production orchestrator.
//
// PixelLab generation runs in the main agent (via MCP tools) — it cannot
// be initiated from this Node script. The produce flow is:
//
//   1. Main agent (Claude) calls mcp__pixellab__create_character / _object
//   2. Main agent downloads the resulting PNG into scripts/scene/raw/<id>.png
//   3. This script picks up raw/<id>.png and runs:
//        a. post-process (alpha threshold + palette quantize + outline snap)
//        b. QA gate
//        c. on pass → move to processed/<id>.png + emit .qa-passed sidecar
//        d. on fail → keep raw + write .qa-failed report
//
// Usage:
//   node produce.mjs <asset-id>
//   node produce.mjs --queued        (process every raw/ file with a matching
//                                     entry in production-list.yaml)

import { readFile, writeFile, mkdir, rename, stat, readdir } from "node:fs/promises";
import { dirname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { argv, exit } from "node:process";

import YAML from "yaml";

import { postProcessPng } from "./post-process.mjs";
import { validateAsset } from "./validate-asset-qa.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, "..", "..");
const PRODUCTION_LIST = join(REPO_ROOT, "docs", "art", "production-list.yaml");
const RAW_DIR = join(__dirname, "raw");
const PROCESSED_DIR = join(__dirname, "processed");
const REPORT_DIR = join(__dirname, "reports");

/** Read & parse production list. */
async function loadProductionList() {
  const text = await readFile(PRODUCTION_LIST, "utf-8");
  return YAML.parse(text);
}

/** Find an asset entry by id across all sections (foundation, characters, rooms, ...). */
function findEntry(plist, id) {
  for (const section of [
    "foundation",
    "characters",
    "rooms",
    "hallway",
    "effects",
    "icons",
  ]) {
    const list = plist[section] ?? [];
    const found = list.find((e) => e.id === id);
    if (found) return found;
  }
  return null;
}

/** Convert asset id → safe filename (replace "/" with "__"). */
function idToFile(id) {
  return id.replace(/\//g, "__") + ".png";
}

/** Convert filename back to id. */
function fileToId(file) {
  return file.replace(/__/g, "/").replace(/\.png$/, "");
}

/** Run produce pipeline on a single asset. */
async function produceOne(assetId, plist) {
  const entry = findEntry(plist, assetId);
  if (!entry) {
    throw new Error(`asset id "${assetId}" not in production-list.yaml`);
  }

  const fname = idToFile(assetId);
  const rawPath = join(RAW_DIR, fname);
  const processedPath = join(PROCESSED_DIR, fname);
  const reportPath = join(REPORT_DIR, fname.replace(/\.png$/, ".json"));

  // 1. Check raw exists
  try {
    await stat(rawPath);
  } catch {
    throw new Error(
      `raw asset missing at ${rawPath}\n` +
        `Run PixelLab first (in main agent), save output to that path.`,
    );
  }

  // 2. Post-process
  const rawBuf = await readFile(rawPath);
  const processedBuf = await postProcessPng(rawBuf, {
    size: entry.size,
    snapOutline: entry.type !== "icon" && entry.type !== "palette",
  });

  await mkdir(PROCESSED_DIR, { recursive: true });
  await writeFile(processedPath, processedBuf);

  // 3. QA validate
  const spec = {
    type: entry.type,
    size: entry.size,
    pivot: entry.pivot,
  };
  const result = await validateAsset(processedPath, spec);

  await mkdir(REPORT_DIR, { recursive: true });
  await writeFile(
    reportPath,
    JSON.stringify(
      {
        asset_id: assetId,
        timestamp: new Date().toISOString(),
        spec,
        ok: result.ok,
        errors: result.errors,
        warnings: result.warnings,
      },
      null,
      2,
    ),
  );

  return { assetId, ok: result.ok, errors: result.errors, warnings: result.warnings };
}

/** Process every raw/<file> that has a matching production-list entry. */
async function produceQueued(plist) {
  await mkdir(RAW_DIR, { recursive: true });
  const files = await readdir(RAW_DIR);
  const pngs = files.filter((f) => f.endsWith(".png"));
  if (pngs.length === 0) {
    console.log("No raw assets to process. Drop PNGs in scripts/scene/raw/");
    return [];
  }
  const results = [];
  for (const file of pngs) {
    const id = fileToId(file);
    const entry = findEntry(plist, id);
    if (!entry) {
      console.warn(`⚠ skipping ${file} — no entry "${id}" in production-list.yaml`);
      continue;
    }
    try {
      const r = await produceOne(id, plist);
      results.push(r);
      const status = r.ok ? "✓" : "✗";
      console.log(`${status} ${id}${r.warnings.length ? ` (${r.warnings.length} warn)` : ""}`);
      if (!r.ok) {
        for (const e of r.errors) console.log(`    ${e}`);
      }
    } catch (err) {
      console.error(`✗ ${id} crashed: ${err.message}`);
      results.push({ assetId: id, ok: false, errors: [err.message], warnings: [] });
    }
  }
  return results;
}

async function main() {
  const args = argv.slice(2);
  const plist = await loadProductionList();

  if (args.includes("--queued") || args.length === 0) {
    const results = await produceQueued(plist);
    const ok = results.filter((r) => r.ok).length;
    const fail = results.length - ok;
    console.log(`\nProduced: ${ok} ok, ${fail} failed`);
    if (fail > 0) exit(1);
    return;
  }

  const id = args[0];
  const result = await produceOne(id, plist);
  console.log(`${result.ok ? "✓" : "✗"} ${id}`);
  for (const w of result.warnings) console.log(`  ⚠ ${w}`);
  for (const e of result.errors) console.log(`  ✗ ${e}`);
  if (!result.ok) exit(1);
}

main().catch((err) => {
  console.error("✗ produce crashed:");
  console.error(err);
  exit(2);
});
