# firefly-mesh /scene — Art Bible (v3.0)

**Status**: locked. Any change requires a major version bump and re-baseline of all visual regression goldens.

This is **not** a vibe doc. Every parameter is a contract. Every PixelLab call must reference this file. The asset QA gate validates against these numbers.

If a rule conflicts with what looks "nicer", the rule wins. Visual consistency at production scale beats per-asset optima.

## v3.0 — True isometric + tile-based floor plan + occlusion (2026-05-08)

Two compounding direction changes:

**Change 1: Visual tier and projection**
- Projection: **true isometric (1:1:1 dimetric)** — cube projects to a regular hexagon. NOT 2:1 dimetric (Stardew). Reason: a true-iso cube has 60° edges and a regular hexagonal silhouette, which is the geometry users describe as "正六边形". Multiple rooms align cleanly only under one projection; v2.0's 2:1 dimetric drifted between calls.
- Visual tier: **Eastward / Owlboy mid-density**, not Stardew low-density. Realised by adopting the user's existing 116–124px PixelLab firefly-folk character library (10 archetypes, 8 directions, idle + walk animations all generated). Character bbox redefined accordingly.
- Character bbox: **24×24 → 116×116** (centre-cropped from 116×116 PixelLab canvas; character occupies central ~52×69)
- Character pivot: **(12,24) → (58,108)** (centre-x, ~93 % down — character's feet)

**Change 2: Floor plan composition**
- Rooms are **no longer rendered as single 256×192 PNGs**. They are composed at runtime in Phaser from **modular isometric tile pieces**: floor tiles, wall sections, corner pieces, doorway pieces, furniture sprites. Multiple offices visually compose into "one floor of an office building" with shared hallway and matching geometry.
- Reason: PixelLab integral-room generation produced inconsistent angles (some 30° dimetric, some 45° high-down, some true iso) — visually broken when placed adjacent. Tile-based generation forces every piece through identical view parameters.

**Change 3: Occlusion**
- Characters behind back walls / front-row furniture render as **outline silhouette ghosts** (white 1-px outline at 30 % alpha overlay), not invisible.
- Implemented via Phaser custom shader pipeline + 3-layer depth sort (floor / character / front-occluder).

V1.0 and v2.0 spec for `Character bbox`, `view`, `rooms (integral)`, are superseded by §1, §3, §4, §5b below. Palette + animation framerate spec carries forward unchanged.

---

## 1. Core spec

| Param | Value | Why |
|---|---|---|
| **Projection** | **True isometric (1:1:1 dimetric)** | Cube projects to a regular hexagon (60° edges). Multiple rooms tile cleanly only under one projection; non-true iso drifts visually. |
| Elevation angle | **30°** (camera looks 30° down from horizontal) | Standard true-iso elevation; matches PixelLab `view: high top-down` calibrated outputs |
| Azimuth angle | **45°** (camera oriented along NE→SW diagonal) | Standard true-iso azimuth |
| Axis ratio (screen) | **1 : 1 : 1** | Equal screen lengths along x / y / z; no axis is foreshortened |
| Floor tile shape | **Regular rhombus** with 60° / 120° angles | Tessellates into hexagonal grid; every floor tile identical geometry |
| Floor tile size | **64 × 32 px** (regular rhombus footprint at 30° elevation) | Half-pixel precision on edges; PixelLab nearest-power output |
| Wall section size | **64 × 96 px** (1 floor tile wide × 3 floor heights) | Standard back-wall element; same width as floor tile so tessellation aligns |
| Character canvas | **116 × 116 px** (PixelLab default for v3.0 size=96 input) | Inherited from existing firefly-folk sprite library; character occupies central ~52×69 |
| Character "feet" anchor (pivot) | **(58, 108)** in 116×116 sprite coords | x = canvas centre (58); y ≈ 93 % down (108) — bottom of feet, where shadow ellipse lands |
| Light direction | **upper-left** (NW→SE shading), single key light | Consistent across all assets; characters and rooms agree on highlight side |
| Shadow plane | **floor-projected ellipse**, dark-purple ramp 6 darkest `#2c1f3a` rendered with 50 % palette dither (alternating pixels, not alpha) | Shared shadow primitive composed at runtime, never baked into character sprite |
| Outline | **1 px**, ramp 0 darkest `#1a1226` for sprites at z=0 | Eastward signature; no anti-aliasing |
| Anti-aliasing | **forbidden** anywhere | Nearest-neighbour scaling only |
| Transparency | **fully opaque OR fully transparent** | No partial-alpha pixels (HR8). Wings + occlusion ghost use sparse pixels (HR8a), not alpha. |
| Animation framerate | **8 fps walk / 6 fps idle / 4 fps work** | Locked; existing PixelLab firefly-folk sprites use these |
| **Iso reference grid** | `docs/art/iso-grid-reference.png` (32×32 hex grid) | Master grid; every PixelLab call cites this. QA gate measures floor edge angles against it (HR12). |

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

## 3. Character spec — Firefly Folk (v3.0)

All employees are anthropomorphic firefly people. **The brand is the body.** Generic office humans are forbidden; the species itself is the differentiator.

V3.0 adopts the **existing 10-archetype firefly-folk PixelLab library** as canonical. Sprites are 116–124 px square canvases with characters occupying central ~52×69 area, generated under PixelLab `view: high top-down` which is equivalent to true-iso 30°/45° elevation. Eight directions + idle + walk animations already shipped per archetype.

### 3.1 Canvas geometry (116×116 square)

```
116 ┌────────────────────────────────────┐
    │                                    │  ← top padding (canvas margin
    │                                    │     for animation excursion)
    │            ▲       ▲               │  ← antennae
    │           ░░░░░░░░░░░               │  ← head (round, ~16px)
    │           ░░██████░░                │
    │          ░░██░░░░██░░               │
    │           ░░██████░░                │
    │      ▓▓▓▓ ░░░░░░░░░░ ▓▓▓▓           │  ← shoulders + wing roots
    │   ░≈≈ ▓▓▓▓████████▓▓▓▓ ≈≈░         │  ← torso (~52 px wide
 58 │  ░≈≈≈ ▓▓▓ █████████ ▓▓▓ ≈≈≈░       │     including arms +
    │   ░≈≈ ▓▓▓ █████████ ▓▓▓ ≈≈░        │     wings flanking)
    │       ▓▓ ███████████ ▓▓             │
    │           ░▓▓▓▓▓▓▓░                 │
    │           ▓▓▓▓▓▓▓▓▓                 │  ← waist
    │            ░░▒▒▒▒▒░░                │  ← lantern abdomen
    │             ░▒▒▒▒▒░                 │     (yellow ramp 3 glow,
    │              ░▒▒▒░                  │      animated; HR10/11)
    │               ▒▒                    │
    │              ░░░░                   │  ← short legs
    │            ░░shadow░░               │  ← shadow ellipse
  0 └────────────────────────────────────┘
    0                                  116
    ◄─── wing footprint ───► (sparse-pixel translucency, HR8a)
```

Pivot: `(58, 108)` — character feet, not canvas centre. All entity y-sorting uses pivot.

### 3.2 Asset source — existing PixelLab firefly-folk library

V3.0 does **not** generate new character sprites. The 10-archetype library was produced and curated by the user; quality has been accepted. The `download-pixellab-character.mjs` script pulls each character's 8 rotations + 16–18 animations into `scripts/scene/raw/` for atlas packing.

| Sprite ID (PixelLab) | Internal name | Canvas | firefly-mesh role mapping |
|---|---|---|---|
| `2866ca4f-895d-4acc-af34-e061b767855e` | `char/firefly-ceo` | 116×116 | `owner` |
| `90d6b48f-79b3-49d4-bb9b-dd42b3eddc80` | `char/firefly-coo` | 120×120 | `admin` (operations branch) |
| `f70de1f0-1d65-4728-9ea0-9d1183e3fb77` | `char/firefly-cto` | 120×120 | `admin` (technology branch) |
| `6ea5b633-87c9-4afb-a9bb-2ba1502d2e68` | `char/firefly-pm` | 120×120 | `manager` (Product dept) |
| `c38ea2f6-ae3c-4d68-bc87-c2f1fe6d6854` | `char/firefly-marketer` | 120×120 | `manager` (Marketing dept) |
| `48d8b75b-27ab-4d50-a24a-f60e67bc1186` | `char/firefly-service-lead` | 124×124 | `manager` (Service dept) |
| `c67a7a3e-7e0b-46e0-8167-91e829207037` | `char/firefly-warehouse-lead` | 124×124 | `manager` (Operations dept) |
| `e12b7b85-151b-409a-bd0a-703f13f6fe13` | `char/firefly-ops` | 120×120 | `employee` (Operations) |
| `90839f68-2169-4ee7-80a7-b383f3e350e1` | `char/firefly-engineer` | 124×124 | `employee` (Engineering) |
| `43832c49-1875-4e73-b5f2-f1ea5c6df9ed` | `char/firefly-designer` | 124×124 | `employee` (Design) |

Auditor role re-uses `firefly-ops` sprite with role-tag overlay (V0.2 may add dedicated auditor sprite).

#### Pivot calibration per archetype

Different canvas sizes (116 vs 120 vs 124) all centre the character; pivot is computed at runtime from each manifest entry's declared `pivot` field, NOT hard-coded. `download-pixellab-character.mjs` analyses each sprite's south-facing frame to detect the feet centre and writes the pivot into manifest. QA gate (HR15) verifies pivot is within ±2 px of expected.

### 3.3 Direction set (8 cardinals, all generated)

PixelLab firefly-folk library provides all 8 directions natively (`south`, `south-east`, `east`, `north-east`, `north`, `north-west`, `west`, `south-west`). **V3.0 abandons the v2.0 mirror trick** because the existing library has all 8 directions painted with subtle anatomy differences (wing tilt, lantern angle, head turn) that mirroring would lose. HR6 (mirror trick) is REPEALED for characters; still applies to objects with no left/right asymmetry.

### 3.4 Animation set (matches existing PixelLab library)

| Anim | Source | Frames | FPS | Lantern behaviour at runtime |
|---|---|---|---|---|
| `idle-{dir}` | PixelLab `breathing-idle` (per-direction) | 4 | 6 | **Pulse overlay**: ramp 3 light → mid → light → mid (lantern is in source sprite; engine adds tint cycle at runtime) |
| `walk-{dir}` | PixelLab `walk` (per-direction) | 6 | 8 | **Steady light** overlay |
| `work-s` (S only) | PixelLab `drinking` template (queue when needed) | 4–6 | 4 | **Dim + burst** overlay |
| `talk-s` (S only) | (no source yet — V0.2 adds) | n/a | n/a | placeholder = idle-s with **double-pulse** lantern overlay |

The lantern pulse is **engine-side**, not in the sprite frame — engine tints the lantern region (detected from sprite via colour-mask of ramp 3 hues) per state. This means we don't need new frames per state; the same idle-s frames serve `idle` / `talk` / `work` with different lantern rhythms applied. Saves ~2× sprite production.

V1 character set (PixelLab calls): **already produced and shipped** — 0 new generations needed for V1.

V0.2 extends to additional archetypes via palette-swap shader (skin tone, scarf colour) on existing sprites without new PixelLab calls.

## 4. Floor spec — modular tile-based composition (v3.0)

V3.0 abandons integral 256×192 room PNGs. Multiple offices on one floor of an office building are composed at runtime from **modular isometric tile pieces** generated with strict identical view parameters. Reasoning: PixelLab integral-room generation produced angle drift between rooms (some 30° dimetric, some 45° high-down), making them visually broken when adjacent. Tile generation forces every piece through identical prompt geometry.

### 4.1 Tile primitives (V1 set)

All tiles use identical PixelLab parameters: **true isometric, 30° elevation, 45° azimuth, regular rhombus floor (60°/120°), `view: high top-down`, `reference_image: docs/art/iso-grid-reference.png`**.

| Id | Type | Size (px) | Anchor | Description |
|---|---|---|---|---|
| `tile/floor-office` | floor | 64 × 32 | bottom-centre `(32, 32)` | Wood-textured rhombus, warm brown ramp 1 mid |
| `tile/floor-hallway` | floor | 64 × 32 | bottom-centre `(32, 32)` | Polished light tile, neutral ramp 0 light |
| `tile/wall-back` | wall | 64 × 96 | bottom-centre `(32, 96)` | North-facing back wall section, 3 floor-heights tall, light beige with single picture/decoration slot at row 32 |
| `tile/wall-side-W` | wall | 32 × 96 | bottom-right `(32, 96)` | West side wall section, half-width (perspective foreshortening) |
| `tile/wall-side-E` | wall | 32 × 96 | bottom-left `(0, 96)` | East side wall section (mirror of W not allowed — HR6 repealed only for characters; walls are asymmetric due to lighting) |
| `tile/wall-corner-NW` | wall | 64 × 96 | bottom-centre `(32, 96)` | Where N and W walls meet |
| `tile/wall-corner-NE` | wall | 64 × 96 | bottom-centre `(32, 96)` | Where N and E walls meet |
| `tile/doorway-S` | wall | 64 × 96 | bottom-centre `(32, 96)` | Archway in south wall — character can pass through. Optional door sprite hangs in front (animated open/close, V0.2). |
| `furn/desk-CEO` | furniture | 96 × 64 | bottom-centre `(48, 64)` | Premium dark-wood executive desk |
| `furn/desk-employee` | furniture | 64 × 48 | bottom-centre `(32, 48)` | Standard work desk |
| `furn/chair-office` | furniture | 32 × 48 | bottom-centre `(16, 48)` | Office chair, can pair with any desk (front-occluder layer when behind desk) |
| `furn/bulletin-board` | furniture | 48 × 64 | bottom-centre `(24, 64)` | Wall-mounted, attached to back wall — for sticky-note fan-out anim |
| `furn/water-cooler` | furniture | 32 × 64 | bottom-centre `(16, 64)` | Tall cylinder |
| `furn/plant-small` | furniture | 32 × 48 | bottom-centre `(16, 48)` | Small potted plant for ambience |
| `furn/whiteboard` | furniture | 64 × 48 | bottom-centre `(32, 48)` | Wall-mounted to back wall |

V1 total: **15 tile pieces**. Each tile is a single PixelLab `create_object` call with `directions: 1` (no rotation needed, all tiles render in fixed orientation in the scene grid).

### 4.2 Floor plan composition

Phaser composes a single office floor at runtime from these tiles. The composition is data-driven from a `floor-plan.yaml` file — V0.2 supports user-edited layouts; V1 ships one canonical layout:

```
                    iso-grid (12 cols × 9 rows of floor tiles)
            col:  0  1  2  3  4  5  6  7  8  9 10 11

    row 0:   [────── back walls ──────][D][────── back walls ──────]
    row 1:   │  CEO Office          │  D  │  Product Maker Space │
    row 2:   │  desk + plant        │  o  │  desk(2) + table     │
    row 3:   │  bulletin            │  o  │                      │
    row 4:   ├───door────────────r──┤──W──├──door────────────────┤
    row 5:   │      hallway          tiles                        │
    row 6:   ├──door────────────────┤──W──├──door────────────────┤
    row 7:   │  Sales Bullpen        │  o  │  Floor Flex          │
    row 8:   │  4 desks (2×2)        │  o  │  hot desks (1 row)   │
    row 9:   │  whiteboard, cooler   │  o  │  plant               │
            [────── back walls ──────][D][────── back walls ──────]
```

The floor plan YAML (per V1 demo):

```yaml
# packages/web/public/scene/floor-plans/v1-default.yaml
floor:
  cols: 12
  rows: 9
rooms:
  - id: ceo-office
    pos: { col: 0, row: 0 }
    size: { cols: 5, rows: 4 }
    floor_tile: tile/floor-office
    furniture:
      - { id: furn/desk-CEO, col: 2, row: 1 }
      - { id: furn/chair-office, col: 2, row: 2 }
      - { id: furn/bulletin-board, col: 2, row: 0, attached: back }
      - { id: furn/plant-small, col: 0, row: 0 }
    desk_slots:
      - { col: 2, row: 1, facing: S }      # CEO desk
  - id: product-maker
    pos: { col: 7, row: 0 }
    size: { cols: 5, rows: 4 }
    ...
  - id: hallway
    pos: { col: 0, row: 4 }
    size: { cols: 12, rows: 1 }
    floor_tile: tile/floor-hallway
    furniture: []                           # hallway is bare
  - id: sales-bullpen
    ...
  - id: floor-flex
    ...
```

**Why YAML at runtime, not bake-into-image**: V0.2+ may add departments dynamically based on `org.departments` data; we want the floor plan to scale automatically without re-shipping art assets.

### 4.3 Desk slot binding to employees

Each `desk_slots` entry maps to a position in iso-grid coords. `OrgScene.placeEmployees()` deterministically assigns:

1. Owner → CEO Office desk slot 0
2. Department-head managers → their dept's first desk slot (head sits at the rank-0 slot, deterministically by dept name alphabetic)
3. Employees → remaining slots in their dept by alphabetic order
4. Overflow → spawned at hallway "standee" positions (no desk, just standing)

### 4.4 Wall-attachment semantics

Furniture with `attached: back` means the sprite renders **at the same z-depth as the back wall** (not as a free-floating object). Used for: bulletin board, whiteboard, framed prints, calendars. Engine treats them as wall layer for occlusion purposes — characters never appear in front of these (they're always behind).

This is different from `attached: floor` (default): plant, desk, chair — these participate in y-sort and characters can be in front of or behind them.

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

## 5b. Occlusion (X-ray ghost) — character behind walls

**Rule (HR12)**: When a character entity is occluded by a wall section or front-row furniture, the character does not become invisible. Instead, an **outline silhouette ghost** is rendered overlaying the occluding sprite, indicating the character's position and identity through the obstruction.

### 5b.1 Visual specification

- **Ghost source**: 1-px outline extracted from the character's current animation frame via Sobel edge detection (run once per frame change) or pre-baked outline atlas
- **Ghost colour**: ramp 0 light `#e8d8c4` (soft warm white)
- **Ghost opacity**: 30 % (achieved through 3-pixel-pattern dither against a transparent background — preserves HR8 no-partial-alpha)
- **Ghost layer**: rendered as Phaser overlay on **top of** the front-occluder layer, but **only when** the character's hit-box overlaps an occluder hit-box at depth > character depth
- **Lantern through walls**: the lantern abdomen pixel cluster is rendered at **full opacity** even within the ghost (firefly tell shines through walls — it's a brand differentiator, intentional violation of strict occlusion realism)

### 5b.2 Three-layer scene structure

```
Layer 0 — floor                  (always at bottom, never occluding)
Layer 1 — back walls + back-attached furniture  (decorations on north/east/west walls)
Layer 2 — characters             (y-sorted within layer, depth = pivot.y)
Layer 3 — front-occluder furniture  (south-facing desk fronts, plants close to camera)
                                     and front walls (rare; mostly we don't render
                                     SE-facing walls to keep rooms readable)
Layer 4 — outline ghosts         (only where layer 2 is occluded by layer 3)
```

### 5b.3 Implementation hook

Phaser custom pipeline implements `OutlineGhostPipeline` — when a character sprite's render is requested, a parallel render writes the outline-only ghost to a separate render target tagged with character id. The Layer 4 pass alpha-tests the ghost against layer 3 occluder masks and composites visible portions.

Detail in `packages/web/components/scene/systems/OcclusionSystem.ts` (Phase 1 milestone M1-3a; see plan.md).

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
| HR3 | All sprites have pivot at the position declared in `manifest.json.{section}.{id}.pivot`; characters use `(58, 108)` ±2 px (v3.0); objects use `(centre, bottom)` ±1 px | Old theater pivots were eyeballed, characters jittered when entity y-sorted |
| HR4 | Every animation frame count and fps follows §1 + §3.4 tables | Old theater had idle = 6 frames in some chars, 4 in others |
| HR5 | All shadows are the same elliptical primitive, not redrawn per character | Old theater had hand-drawn shadows that varied |
| HR6 | ~~All directions use mirror trick~~ — **REPEALED for characters in v3.0** (the existing 10-archetype library has all 8 directions painted with subtle anatomy differences; mirroring would lose detail). Mirror trick still applies to **objects with no left/right asymmetry** (a chair facing E and a chair facing W can be mirrors). | v2.0 reasoning was production-cost optimisation; v3.0 absorbs already-shipped 8-dir character library where this is moot |
| HR7 | Reject and re-roll any asset that doesn't pass automated QA (palette / size / pivot / transparency / iso-angle) | Old theater accepted whatever PixelLab returned |
| HR8 | No partial-alpha pixels anywhere | Stardew/Eastward style has hard outlines; soft alpha looks "blurry" against tilemap |
| HR8a | **Wings use sparse-pixel translucency**: 1px outline (ramp 5 mid) + interior dots at ~30 % density (ramp 5 light), rest transparent. Never alpha-blend wings. | v2.0 adds firefly wings; preserves HR8 |
| HR9 | **Every character carries the firefly anatomy**: 2 antennae + sparse-pixel wings + glowing lantern abdomen + dark-purple torso. No "human only" employees. | v2.0 brand DNA — the character body IS the brand |
| HR10 | **Lantern abdomen colour is fixed to ramp 3** (`#7a5a1a / #c89a3a / #f0c75e / #fae8a8`). Never tinted away from yellow. | Brand readability — lantern colour is the firefly tell |
| HR11 | **Lantern animation matches state**: idle pulses, walk steady, work dim+burst, talk double-pulse. Implemented engine-side as colour tint cycle on lantern region; same source frames serve all states. | Players read entity state from lantern rhythm, not just sprite frame |
| HR12 | **All tile pieces and rooms use TRUE isometric projection** (1:1:1 dimetric, 30° elevation, 45° azimuth, regular hexagonal cube outline). QA gate `validate-iso-angle.mjs` measures floor-edge angles against `docs/art/iso-grid-reference.png`; reject if drift > 2°. | Old theater had angle drift between rooms (some 30° dimetric, some 45° high-down); they didn't tile cleanly when placed adjacent |
| HR13 | **Floor plan composes from modular tile primitives at runtime**, never integral room PNGs. Every PixelLab call uses identical view + reference geometry (HR12). | Per-room PixelLab generation is the source of angle drift; HR13 makes drift impossible |
| HR14 | **Occlusion is mandatory**: character behind wall or front-row furniture renders as outline ghost (§5b). Characters never disappear. | Don't Starve / Hollow Knight standard; players must always see where their entity is |
| HR15 | **Every shipped sprite has a transparent pivot dot at declared coords ±2 px**. Auto-detected by `validate-asset-qa.mjs` and written into `manifest.json` per asset (not eyeballed). | Old theater pivots drifted, leading to "character teleporting half a tile when entering rooms" |

These rules are encoded in `scripts/scene/validate-asset-qa.mjs` and run as merge gate.
