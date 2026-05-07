# /scene — Asset Production Pipeline

End-to-end flow from "we need a sprite" to "it's in the game". Every step is automated where possible; manual steps have explicit acceptance criteria.

## 1. Pipeline overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                    Production List (YAML, source)                    │
│        docs/art/production-list.yaml — every asset has an id         │
└────────────────────────────┬─────────────────────────────────────────┘
                             │ pnpm scene:produce <asset-id>
                             ▼
┌──────────────────────────────────────────────────────────────────────┐
│   Step 1 — PixelLab call (deterministic seed, citing style ref)      │
│   scripts/scene/pixellab-character.mjs (or pixellab-room.mjs)        │
│   Output: raw/<asset-id>.png                                         │
└────────────────────────────┬─────────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────────────┐
│   Step 2 — Auto post-process                                         │
│   scripts/scene/post-process.mjs                                     │
│   • Quantize to palette.png                                          │
│   • Strip alpha (hard threshold 128)                                 │
│   • Detect & validate pivot point                                    │
│   • Crop to declared bounding box                                    │
│   Output: processed/<asset-id>.png                                   │
└────────────────────────────┬─────────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────────────┐
│   Step 3 — QA gate (automated, merge-blocking)                       │
│   scripts/scene/validate-asset-qa.mjs                                │
│   ✓ palette ⊆ master palette                                         │
│   ✓ dimensions match production-list.yaml                            │
│   ✓ pivot at expected coords (±1 px tolerance)                       │
│   ✓ no partial-alpha pixels                                          │
│   ✓ outline colour = #1a1226                                         │
│   ✓ animation frame count matches manifest                           │
│   On fail → reject + log + open issue                                │
│   On pass → emit .qa-passed sidecar                                  │
└────────────────────────────┬─────────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────────────┐
│   Step 4 — Atlas pack                                                │
│   scripts/scene/build-sprite-atlas.mjs (uses free-tex-packer-core)   │
│   • Pack QA-passed PNGs into atlases by class                        │
│     (characters.png, rooms.png, effects.png)                         │
│   • Emit atlas JSON in Phaser's expected format                      │
│   • Update manifest.json with atlas references + checksum            │
│   Output: public/scene/assets/atlas/*.png + *.json + manifest.json   │
└────────────────────────────┬─────────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────────────┐
│   Step 5 — Visual regression baseline                                │
│   pnpm scene:visual-baseline                                         │
│   • Boot scene with seeded fixture                                   │
│   • Capture screenshots at frames 0 / 60 / 600                       │
│   • Compare to current goldens (tests/visual/golden/*.png)           │
│   • If diff > 0.5% → fail with diff image attachment                 │
└──────────────────────────────────────────────────────────────────────┘
```

## 2. Producing a single asset

### 2.1 Add to production list

Edit `docs/art/production-list.yaml`:

```yaml
- id: "char/manager-default"
  type: "character"
  description: "Smart-casual manager, ginger short hair, neutral skin, light beard"
  archetype_template: "manager"        # references PixelLab template
  status: "queued"                     # queued | producing | qa-failed | shipped | retired
  size: { w: 16, h: 24 }
  pivot: { x: 8, y: 24 }
  animations: [idle, walk, work, talk]
  directions: [N, NE, E, SE, S]        # W/NW/SW = mirrored at runtime
  seed: null                           # auto-derived sha256(id)
  notes: ""
```

### 2.2 Run production

```bash
# Single asset
pnpm scene:produce char/manager-default

# All queued assets
pnpm scene:produce-queued

# Force re-roll (e.g. art bible bumped)
pnpm scene:produce char/manager-default --force
```

The `produce` script calls Steps 1–3 in sequence. On QA fail it stops and prints the diff. On success it prints "shipped: char/manager-default — added to atlas queue".

### 2.3 Build atlas + manifest

```bash
pnpm scene:build-atlas
```

Runs Step 4. Updates `manifest.json` with new SHA-256 checksum. **All accepted assets in `processed/` go in**; pending or failed are excluded.

### 2.4 Visual regression

```bash
pnpm scene:visual-baseline           # update goldens after intentional change
pnpm scene:visual-test               # run tests (CI default)
```

## 3. Determinism guarantees

| Layer | What's deterministic | Tool |
|---|---|---|
| PixelLab call | Same input → same output (PixelLab guarantees seed determinism) | `seed` field auto-derived from `sha256(asset.id)` |
| Post-process | Same raw PNG → same processed PNG | Pure transforms (no randomness) |
| QA gate | Same processed PNG → same pass/fail | Pure |
| Atlas pack | Same set of PNGs → same atlas (sorted by id, fixed packing algorithm) | `free-tex-packer-core` `--maxRectsBin BSSF` (deterministic) |

This means: **`pnpm scene:produce-queued` on a fresh checkout produces byte-identical assets to the ones in git** if production-list.yaml hasn't changed. CI can verify this.

## 4. Style reference image

`docs/art/style-reference.png` is the master reference cited by every PixelLab call.

### 4.1 Generation

`scripts/scene/build-style-reference.mjs` — runs ONCE during initial bootstrap:

1. Calls PixelLab for the canonical character pose (S facing, idle frame 0)
2. Calls PixelLab for the canonical room interior (sales bullpen)
3. Calls PixelLab for one sticky note + one a2a line sample
4. Composes onto a 512×384 PNG with the palette ramp at the bottom
5. Outputs `docs/art/style-reference.png`

After step 5, **the file is committed to git and never auto-regenerated**. If we want a different style, we manually decide, regenerate, and treat it as a major version bump (re-roll all production assets).

### 4.2 The bootstrapping circularity

> "How can the style reference be generated by PixelLab when PixelLab needs a style reference?"

Answer: the **first** generation has no `reference_image`, only the prompt. We then human-eyeball it, iterate maybe 3–5 times until it matches the art bible spec (which is text-only, doesn't depend on the image). Once locked, it serves as the seed for all subsequent generations.

The art bible's text spec is the **first principle**. The reference image is the **derived artefact** that makes prompts more reliable. PixelLab without a reference_image is more variable; with one, it's anchored.

## 5. Production list lifecycle

A production list entry has these states:

| State | Meaning | Next states |
|---|---|---|
| `queued` | Waiting for production | `producing` |
| `producing` | PixelLab call in flight | `qa-failed` / `qa-passed` |
| `qa-failed` | QA gate rejected | `queued` (re-roll) / `retired` (give up) |
| `qa-passed` | All gates passed | `shipped` |
| `shipped` | In atlas, deployed | `retired` |
| `retired` | No longer used (e.g. archetype removed) | (terminal) |

## 6. Atlas / packing strategy

Three atlases at V1, sized to fit:

| Atlas | Contents | Max size | Reason |
|---|---|---|---|
| `characters.atlas.png` | All character sprite frames (V1: 4 chars × ~336 frames = ~1300 frames) | 1024×1024 | Power-of-2; safe for low-VRAM GPUs |
| `rooms.atlas.png` | Room backgrounds + hallway tiles | 1024×512 | Few large images |
| `effects.atlas.png` | Sticky notes, a2a particles, mascot, icons | 256×256 | Small set |

Each atlas + JSON pair is loaded by `BootScene` via `AssetRegistry.loadAtlas(name)`.

If a class outgrows its atlas, **bump to next power-of-2 (1024 → 2048)**, never split into multiple atlases of the same class — that fragments memory.

## 7. Frame ordering convention

In a spritesheet for a multi-direction animation, frames are ordered:

```
row 0: idle-N frames 0..3
row 1: idle-NE frames 0..3
row 2: idle-E  frames 0..3
row 3: idle-SE frames 0..3
row 4: idle-S  frames 0..3
row 5: walk-N  frames 0..7
... etc
```

This is the input format Phaser's `anims.create({ frames: anims.generateFrameNumbers(...) })` expects. Documented in `manifest.json.characters[id].frames`.

## 8. Tooling versions (locked)

| Tool | Version | Why |
|---|---|---|
| `node` | ≥24 (matches firefly-mesh root) | Same runtime as the dashboard |
| `pnpm` | ≥10 | Same package manager |
| `pixellab` (HTTP API or MCP) | latest stable | API contract |
| `pngquant` (post-process palette quantize) | 2.18+ | High-quality dither-free quantize |
| `free-tex-packer-core` | latest | Atlas packing |
| `playwright` | matches firefly-mesh root | Visual regression |
| `pixelmatch` | latest | Diff for visual regression |

Lock versions in `packages/web/scripts/scene/package.json` (separate from main app deps to keep main bundle clean).

## 9. CI gates

Every PR that touches `public/scene/assets/` or `docs/art/` runs:

1. **Lint** — yaml schema check on `production-list.yaml`
2. **QA gate** — `validate-asset-qa.mjs` on every changed PNG
3. **Manifest sync** — fail if `manifest.json` checksum doesn't match the assets it references
4. **Visual regression** — diff against goldens, threshold 0.5% pixel change
5. **Bundle delta** — ensure non-`/scene` route bundle hasn't grown

PRs that touch `docs/art/firefly-mesh-art-bible.md` additionally require:
- A justification in the PR description
- Re-run of full production pipeline (in a CI matrix job)
- Approval from designated art reviewer (for V1: Wenxuan)

## 10. Triage flow when QA fails

```
QA gate fails
  │
  ▼
Read failure reason from QA output
  │
  ├─ palette out of bounds → re-quantize, OR if persistent: PixelLab seed unstable; bump seed
  │
  ├─ pivot off → check sprite generation; usually means PixelLab placed character mid-frame
  │              instead of bottom-anchored. Adjust prompt, re-roll.
  │
  ├─ partial-alpha pixels → post-process threshold too low; adjust threshold
  │
  ├─ size wrong → PixelLab returned different aspect ratio; constrain via `size` parameter
  │
  └─ outline colour wrong → outline_color parameter not respected; use post-processor outline-replace
```

After 3 failed re-rolls of the same asset, **manually escalate**: either the prompt is wrong (revise art bible's archetype template) or the asset is over-spec (revise production-list size).

## 11. Style drift detection (early warning)

A separate CI job runs nightly:

1. Pick 3 random shipped assets from manifest
2. Re-roll them with their seeded prompts (no reference change)
3. Compare to current shipped versions

If diff > 1% pixels: **PixelLab API behaviour drifted** (model update). Trigger alert, investigate, possibly lock to a model version.

This is the "粗糙" canary — catches the kind of slow drift that ruined the old theater before it ruins this one.
