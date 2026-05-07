# firefly-mesh /scene — Art Bible (v1.0)

**Status**: locked. Any change requires a major version bump and re-baseline of all visual regression goldens.

This is **not** a vibe doc. Every parameter is a contract. Every PixelLab call must reference this file. The asset QA gate validates against these numbers.

If a rule conflicts with what looks "nicer", the rule wins. Visual consistency at production scale beats per-asset optima.

---

## 1. Core spec

| Param | Value | Why |
|---|---|---|
| Base tile size | **16 × 16 px** | Stardew lineage, PixelLab strongest output band |
| Character sprite bbox | **16 × 24 px** (tall) | 1-tile-wide character, 1.5 tiles tall — readable at distance, identifiable from one frame |
| Character "feet" anchor (pivot) | **(8, 24)** in sprite coords (centred, bottom) | All entity positioning anchored at feet so depth-sort by `y` works |
| Room background tile | **256 × 192 px** (16 × 12 tiles) | One screen at default zoom shows ~2 rooms + hallway segment |
| View / projection | **2:1 dimetric isometric, 30° pitch** | Multiple rooms visible; rectangular drawing easier than 30° true iso |
| Light direction | **upper-left**, single key light | Consistent across all assets; no contradictory shadows |
| Shadow plane | **floor-projected**, 50% opaque dark-purple `#2c1f3a` | Single shared shadow style; characters cast same elliptical shadow |
| Outline | **1 px black** (`#1a1226` from palette) | Stardew signature; no anti-aliasing |
| Anti-aliasing | **forbidden** anywhere | Hard nearest-neighbour scaling only |
| Transparency | **fully opaque OR fully transparent** | No partial-alpha pixels (ruins palette discipline) |
| Animation framerate | **8 fps** for walk / **6 fps** for idle / **4 fps** for work | Locked; no per-asset variations |

## 2. Master colour palette (32 colours, locked)

Stored as `docs/art/palette.png` (32×1 single row), which is the exact file PixelLab `palette_image` parameter receives. Every sprite quantizes to this palette.

### 2.1 Palette ramp design

The palette is organised as 8 ramps × 4 shades — `darkest, dark, mid, light` in each ramp:

| Ramp | Darkest | Dark | Mid | Light | Use |
|---|---|---|---|---|---|
| **0 — neutrals** | `#1a1226` | `#3d3052` | `#80708e` | `#e8d8c4` | outlines, sky, soft UI |
| **1 — warm browns (firefly brand)** | `#5c2f1a` | `#a55a35` | `#d68957` | `#f5d8a8` | wood furniture, walls, floor |
| **2 — orange (firefly accent)** | `#a83a1a` | `#e85b3a` | `#f08c5e` | `#fbc78f` | brand orange, request a2a, sticky notes |
| **3 — yellow** | `#7a5a1a` | `#c89a3a` | `#f0c75e` | `#fae8a8` | task highlights, fireflies |
| **4 — green (commit/online)** | `#2a4a2a` | `#4a8a4a` | `#7ac275` | `#b8e8a8` | online dot, commit a2a, plants |
| **5 — blue (inform/sync)** | `#1a3a5a` | `#3a6a9a` | `#5a9ad0` | `#a8d8f5` | window light, inform a2a |
| **6 — purple (handoff)** | `#2c1f3a` | `#5a3a7a` | `#9a6ac0` | `#c8a8e8` | handoff a2a, shadow base |
| **7 — red (escalate)** | `#5a1a1a` | `#a82a2a` | `#d85a5a` | `#f0a8a8` | escalate a2a, alerts |

The 4 corner colours of every ramp are **fixed** — no in-between shades. PixelLab outputs are quantized to nearest palette entry pre-merge.

### 2.2 Hex sequence (for palette.png generation)

```
#1a1226 #3d3052 #80708e #e8d8c4
#5c2f1a #a55a35 #d68957 #f5d8a8
#a83a1a #e85b3a #f08c5e #fbc78f
#7a5a1a #c89a3a #f0c75e #fae8a8
#2a4a2a #4a8a4a #7ac275 #b8e8a8
#1a3a5a #3a6a9a #5a9ad0 #a8d8f5
#2c1f3a #5a3a7a #9a6ac0 #c8a8e8
#5a1a1a #a82a2a #d85a5a #f0a8a8
```

Generation: `scripts/scene/build-palette-png.mjs` — emits 32×1 pixel PNG, 32-color indexed mode, no alpha.

## 3. Character spec

### 3.1 Geometry

```
24px ┌──────────────┐
     │              │  ← head (top 8 rows)
     │   ░░░░░░     │
     │  ░██████░    │
     │  ░██  ██░    │  ← face features always pixel-perfect symmetric
     │   ████████   │
     │              │  ← torso (rows 8–16)
 8px │   ██████     │
     │   ██████     │  ← shadow ellipse on row 23 (last row)
 0px │  ░ shadow ░  │
     └──────────────┘
       0           16px
```

Constraints:
- Head circle: 8px diameter, centred at (8, 4)
- Body: rectangular, 6px wide
- Feet: at (8, 23) ± 1px tolerance
- Shadow: ellipse 10×2, centred at (8, 23), `#2c1f3a` 50% opaque (palette ramp 6 darkest)
- All animation frames share the same head + body silhouette; only limbs / hair / accessories animate

### 3.2 Direction set (8 cardinals)

`N, NE, E, SE, S, SE, W, NW`. **`S` (facing camera) is the canonical reference frame**; all others derived. Mirror trick: `W = mirror(E)`, `NW = mirror(NE)`, `SW = mirror(SE)`. So we only PixelLab-generate **5 directions** (`N, NE, E, SE, S`) and mirror the rest.

### 3.3 Animation set (V1 minimal)

| Anim | Frames | FPS | Duration | Loop |
|---|---|---|---|---|
| `idle-{dir}` | 4 | 6 | 0.66s | yes |
| `walk-{dir}` | 8 | 8 | 1.00s | yes |
| `work-s` (S only) | 6 | 4 | 1.5s | yes |
| `talk-s` (S only) | 4 | 6 | 0.66s | yes |

- V1 character set: 4 archetypes × 5 directions × (idle 4 + walk 8) + (work 6 + talk 4 only S) = **240 generated frames + 96 mirrored = 336 total frames** for V1
- V0.2 extends to 16 archetypes (adds variations: hair colour, glasses, hats, lab coats)

### 3.4 Archetype list (V1)

| Id | Description | PixelLab seed prompt template (parameterised) |
|---|---|---|
| `ceo-default` | dark suit, brown hair, neutral skin | `pixel art, top-down 2:1 isometric, 16x24 character, business suit, brown short hair, neutral skin, 32-color stardew palette, 1px black outline, no anti-aliasing` |
| `manager-default` | smart casual, ginger hair | (same template, swap traits) |
| `employee-default` | t-shirt + jeans, varied hair | |
| `auditor-default` | grey blazer, glasses | |

Per-employee customisation in V0.2 will be applied via palette-swap shader (no new sprites needed for hair colour variation).

## 4. Room spec

### 4.1 Geometry

| Param | Value |
|---|---|
| Room interior | 16×12 tiles = 256×192 px |
| Wall height | 4 tiles back, 2 tiles side (2:1 dimetric) |
| Floor surface | full bottom 12 tiles |
| Doorway | 2-tile wide gap on the lower (south) wall, centred |
| Furniture density | ~30% of floor surface (sparse — Stardew-grade, not hoarder) |

### 4.2 V1 room set

| Id | Theme | Furniture |
|---|---|---|
| `room-ceo` | small premium office | desk, chair, bulletin board, plant, framed print |
| `room-sales` | bullpen | 4 desks in 2×2, whiteboard, water cooler |
| `room-product` | maker space | 2 desks, prototype table, plants |
| `room-floor` | open-plan flexspace | 4 hot desks + lounge chair (for unassigned employees) |
| `hallway-segment` | corridor | tile-able, fits between any two rooms |

Each room is a single 256×192 PNG (no per-tile decomposition in V1; we draw rooms whole). V0.2 may decompose into tile maps for procedural generation of new departments.

### 4.3 Desk slots

Each room has **N pre-defined desk slots** (in tile coordinates within the room PNG). `OrgScene` deterministically maps employees to slots. Slot data lives in `manifest.json`:

```json
"rooms": {
  "room-sales": {
    "image": "scene/assets/rooms/room-sales.png",
    "size": { "w": 256, "h": 192 },
    "doorway": { "x": 128, "y": 192 },
    "deskSlots": [
      { "x": 64, "y": 80, "facing": "S" },
      { "x": 192, "y": 80, "facing": "S" },
      { "x": 64, "y": 144, "facing": "N" },
      { "x": 192, "y": 144, "facing": "N" }
    ]
  }
}
```

If employee count > slot count: spawn extras at floor positions `(roomX + 16 + i*24, roomY + 160)` (row of standees against the south wall).

## 5. Effect / overlay spec

### 5.1 A2A line

| Param | Value |
|---|---|
| Bezier path | sender desk → ceiling apex (mid-room height + 16px) → receiver desk |
| Line width | 2 px |
| Particle | single 2×2 dot, runs full path in 2s, opacity ramp 0→1→0 |
| Colour by type | request: ramp 2 mid `#f08c5e`; commit: ramp 4 mid `#7ac275`; handoff: ramp 6 mid `#9a6ac0`; inform/sync: ramp 5 mid `#5a9ad0`; escalate: ramp 7 mid `#d85a5a` |
| Pending (HITL) | dashed (4px on / 4px off), pulsing 1Hz |
| Auto-delivered | solid, 50% opacity |

### 5.2 Task sticky note

- Sprite: 12×12 px square, slight rotation (±5°), shadow underneath
- Colour: ramp 3 mid `#f0c75e` (yellow) for default, ramp 2 mid `#f08c5e` (orange) for high-priority
- Bezier flight: rises 32px above origin, arcs to destination, lands at destination tile

### 5.3 Mascot — firefly

8×8 pixel firefly, sole brand mascot. Used in:
- Loading screen (animated 4-frame breathing glow)
- HUD corner watermark
- Empty-state error icons

Shape: oval body + 2 small wings + glowing tail (ramp 3 light `#fae8a8` core, ramp 3 mid `#f0c75e` glow).

## 6. Iconography

UI icons inside Phaser canvas (HUD overlays) use [Lucide](https://lucide.dev/) at 16×16 px, **rendered as bitmap** (not SVG) — pre-rasterised in `scripts/scene/build-lucide-icons.mjs` to maintain pixel-art purity.

Icons exposed:
- `Network`, `Inbox`, `History`, `BookOpen`, `Sparkles`, `Settings`, `Loader2`, `Search`

## 7. Motion language

Restated for art reference (engineering version is in `ui.md` § 8):

| Motion | Easing | Duration | Notes |
|---|---|---|---|
| Idle bob | sine, ±1 px y | 1800ms | applied to sprite, not pivot |
| Blink | hard cut | 80ms × 1 frame, every 4–7s random | on idle anim only |
| Walk step | hard cut | 8 frames @ 8fps = 1s cycle | linear |
| Sticky note flight | ease-out quad | 1400ms | scale 1.0 → 0.95 → 1.0 (settle bounce) |
| A2A trail | linear | 2000ms loop | particle moves along bezier |
| View change camera pan | ease-in-out cubic | 600ms | preserves anchor offset for reduced-motion |

**Reduced motion (CSS `prefers-reduced-motion: reduce`)**:
- All view-change animations 0ms (hard cut)
- Idle bob disabled
- Particles static (line still visible, dot at midpoint)
- Walk anim still plays (it's the entity's primary indicator of state)
- Sticky-note flight: instant teleport

## 8. PixelLab call template (V1)

Every PixelLab call uses this exact template (filled in by `scripts/scene/pixellab-character.mjs`):

```
{
  "model": "create_character / create_object / create_isometric_tile",
  "description": "<archetype-specific traits>",
  "view": "low top-down",
  "size": "16x24 (character) | 256x192 (room) | 16x16 (tile)",
  "palette_image": "docs/art/palette.png",
  "reference_image": "docs/art/style-reference.png",
  "outline_color": "#1a1226",
  "outline_width": 1,
  "anti_aliasing": false,
  "background": "transparent",
  "seed": "<deterministic, derived from asset id sha256>"
}
```

`seed` is deterministic (asset id → sha256 → first 8 hex chars → int) so re-runs produce same output bit-for-bit.

## 9. Style reference image

`docs/art/style-reference.png` is the **single master image** that anchors the entire production. It is **not** a screenshot of any single asset — it's a composed reference card showing:

- 1 character in S facing, idle frame 0 (canonical pose)
- 1 room interior (sales bullpen) at full size
- 4 sticky notes (one of each priority)
- 4 a2a line samples (one of each colour)
- the palette.png ramp at the bottom

Generation order:
1. PixelLab `create_object` for the canonical character pose with explicit prompt
2. PixelLab `create_object` for sales bullpen room with explicit prompt
3. Manual composition in `scripts/scene/build-style-reference.mjs` — places elements onto a 512×384 canvas
4. Output saved as `docs/art/style-reference.png` and committed

After this image exists and the team approves it, **all subsequent PixelLab calls reference it**. The image is the contract.

## 10. Versioning rules

- Bumping any value in §1 — major version bump, regenerate all assets
- Adding a palette ramp — minor version bump, existing assets keep
- Adding a character archetype or room — minor version bump
- Re-rendering a single asset to fix a visual bug — patch bump

Manifest.json carries the version. BootScene rejects mismatched manifests.

## 11. Hard rules (the "粗糙" prevention list)

These rules are written explicitly because they are the diff vs the rejected MultiAgent `/theater` assets:

| # | Rule | Why |
|---|---|---|
| HR1 | All assets cite the same `style-reference.png` in PixelLab calls | Old theater had every asset ad-hoc, drift accumulated |
| HR2 | All assets quantize to the 32-color palette | Old theater had palette drift (every PixelLab call was a fresh dice roll) |
| HR3 | All sprites have pivot at exact `(8, 24)` (character) or `(centre, bottom)` for objects | Old theater pivots were eyeballed, characters jittered when entity y-sorted |
| HR4 | Every animation frame count and fps follows §1 table | Old theater had idle = 6 frames in some chars, 4 in others |
| HR5 | All shadows are the same elliptical primitive, not redrawn per character | Old theater had hand-drawn shadows that varied |
| HR6 | All directions use mirror trick (E→W, NE→NW, SE→SW); never PixelLab a mirror direction separately | Old theater had subtle asymmetries between left/right walking |
| HR7 | Reject and re-roll any asset that doesn't pass automated QA (palette / size / pivot / transparency) | Old theater accepted whatever PixelLab returned |
| HR8 | No partial-alpha pixels anywhere | Stardew style has hard outlines; soft alpha looks "blurry" against tilemap |

These rules are encoded in `scripts/scene/validate-asset-qa.mjs` and run as merge gate.
