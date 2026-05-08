# firefly-mesh /scene — Art Bible (v2.0)

**Status**: locked. Any change requires a major version bump and re-baseline of all visual regression goldens.

This is **not** a vibe doc. Every parameter is a contract. Every PixelLab call must reference this file. The asset QA gate validates against these numbers.

If a rule conflicts with what looks "nicer", the rule wins. Visual consistency at production scale beats per-asset optima.

## v2.0 — Firefly Folk overhaul (2026-05-08)

Major direction change: **all employees are anthropomorphic firefly people** ("firefly folk"), not generic office humans wearing firefly accessories. The brand is the body. Visual changes:

- Character bbox **16×24 → 24×24** (room for wings folded behind back)
- Character pivot **(8,24) → (12,24)**
- All characters share **firefly anatomy**: 2 antennae, sparse-pixel translucent wings, glowing yellow lantern abdomen, dark-purple torso (covered by clothing)
- **Lantern abdomen pulse** is the canonical firefly tell — 4-frame animation tied to entity state (idle / walk / work / talk)
- Wings rendered as **sparse-pixel translucency** (high transparency ratio + 1px outline + 30% interior dots), NOT alpha blending — preserves HR8 "no partial alpha"

V1.0 character spec is superseded by §3 below; v1.0 palette and view system unchanged.

---

## 1. Core spec

| Param | Value | Why |
|---|---|---|
| Base tile size | **16 × 16 px** | Stardew lineage, PixelLab strongest output band |
| Character sprite bbox | **24 × 24 px** (square, v2.0) | Square canvas accommodates wings folded behind back without cropping; 1.5-tile-tall character occupies central 16×24 silhouette |
| Character "feet" anchor (pivot) | **(12, 24)** in sprite coords (centred, bottom, v2.0) | Bbox centre + bottom; entities y-sorted by feet position |
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

## 3. Character spec — Firefly Folk (v2.0)

All employees are anthropomorphic firefly people. **The brand is the body.** Generic office humans are forbidden; the species itself is the differentiator.

### 3.1 Geometry (24×24 square canvas)

```
24px ┌────────────────────────┐
     │                        │  ← rows 0–1: padding
     │       ▲     ▲          │  ← rows 2–3: 2 antennae (1px wide each)
     │      ░░░░░░░░          │  ← rows 4–9: head (round, 8px wide)
     │     ░░██████░░         │      eyes 2-pixel dots, mouth optional
     │     ░██░░░░██░         │
     │      ░██████░          │
     │   ░░░░░░░░░░░░░░       │  ← rows 10–17: torso (dark purple base
 12px│  ░≈ ▓▓▓▓▓▓▓ ≈░         │       covered by clothing); wings flank
     │  ░≈ ▓▓▓▓▓▓▓ ≈░         │       on rows 10–15 (sparse-pixel)
     │  ░░░▓▓▓▓▓▓▓░░░         │
     │     ▓▓▓▓▓▓▓            │
     │     ░▒▒▒▒▒░            │  ← rows 18–20: lantern abdomen (yellow
     │      ░▒▒▒░             │       glow ramp 3 light/mid, animated)
     │       ▒▒▒              │
     │       ░░               │  ← rows 21–22: short legs
 0px │  ░░ shadow ░░          │  ← row 23: shadow ellipse (10×2)
     └────────────────────────┘
       0                    24px
       wing             wing
       (sparse pixels)
```

#### Anatomy constraints (all archetypes share these)

| Element | Position | Size | Colour | Notes |
|---|---|---|---|---|
| **Antennae** (2) | (10, 2)–(11, 4) and (12, 2)–(13, 4) | 1×3 px each | ramp 6 darkest `#2c1f3a` | upright, black filaments |
| **Head** | centred at (12, 7), 8 px diameter | round | skin tone (chosen per archetype) + ramp 6 outline | eyes are 2 dark pixels, mouth optional |
| **Torso** | rows 10–17, 8 px wide centred | rectangular | ramp 6 darkest `#2c1f3a` (firefly base body) | mostly covered by clothing |
| **Wings** (2) | flank torso, rows 10–15, ~6 px wide each side | sparse-pixel | ramp 5 light `#a8d8f5` outline + ramp 5 mid `#5a9ad0` interior dots at 30 % density | translucency simulated by sparseness, NOT alpha (HR8 compliance) |
| **Lantern abdomen** | rows 18–20, centred, 5 px wide | tapered teardrop | ramp 3 mid `#f0c75e` (idle), ramp 3 light `#fae8a8` (peak pulse) | animated — see § 7 motion |
| **Legs** | rows 21–22, 4 px wide centred | short stub | ramp 6 darkest | barely visible; clothing covers legs in most archetypes |
| **Shadow** | row 23, centred at (12, 23), 10×2 ellipse | ramp 6 darkest, **50 % palette dither** (alternating pixels) | rendered as separate sprite at runtime, not baked |
| **Feet pivot** | (12, 24) | exact | transparent dot | required by R15 |

The wings extend the silhouette laterally — **even though the character "torso" is 8 px wide, the full sprite uses ~24 px of width** thanks to wings. This is why bbox is 24×24, not 16×24.

### 3.2 Direction set

Same as v1.0: `N, NE, E, SE, S` PixelLab-generated, `W / NW / SW` are runtime mirrors of `E / NE / SE`.

When character faces north (away from camera), wings are more visible; when facing south (toward camera), wings fold tighter and lantern is most prominent. PixelLab prompt must include direction for context.

### 3.3 Animation set (V1 minimal)

| Anim | Frames | FPS | Duration | Loop | Lantern behaviour |
|---|---|---|---|---|---|
| `idle-{dir}` | 4 | 6 | 0.66s | yes | **Pulse**: light → mid → light → mid (canonical firefly tell) |
| `walk-{dir}` | 8 | 8 | 1.00s | yes | **Steady light** while moving |
| `work-s` (S only) | 6 | 4 | 1.5s | yes | **Dim mid + 1 burst light**: focus mode with rare flash |
| `talk-s` (S only) | 4 | 6 | 0.66s | yes | **Double-pulse**: 2 quick lights per cycle (signal "speaking") |

The lantern's pulsing pattern is the **primary state-readability cue** — players read what an entity is doing from across the room by lantern rhythm alone. This is the firefly-mesh equivalent of Stardew's NPC head bobbing.

- V1 character set: 4 archetypes × 5 directions × (idle 4 + walk 8) + (work 6 + talk 4 only S) = **240 generated frames + 144 mirrored = 384 total frames** for V1
- V0.2 extends to 16 archetypes via palette-swap shader

### 3.4 Archetype list (V1)

Each archetype shares the firefly anatomy + adds **distinctive silhouette** (clothing, hair, hand-prop, posture). Archetypes are designed to be **recognisable from across the room from a single frame** (Stardew rule: every NPC's silhouette is unique).

#### `char/ceo-default` — Maker founder (not a suit)

| Field | Value |
|---|---|
| Hair | brown messy, with stubble |
| Clothing | rolled-up white shirt, dark blue jeans, canvas sneakers |
| Hand prop (S facing) | warm orange coffee mug with steam |
| Posture | slight forward lean (in-the-work) |
| firefly anatomy override | none — all default (deep purple torso under shirt, blue wings, yellow lantern) |
| Skin tone | neutral light |

PixelLab prompt:
> "Pixel art anthropomorphic firefly character — CEO of a multi-agent collaboration startup. Dark purple torso (firefly body), 2 thin black antennae on head, sparse-pixel pale-blue wings folded flanking the back, glowing yellow lantern abdomen (firefly tail-light) at lower rear. Wearing rolled-up white shirt, dark blue jeans, canvas sneakers. Brown messy hair, short stubble, neutral skin. Holding a warm-orange coffee mug with steam rising. Slight forward-leaning posture. Low top-down isometric, 24×24 px sprite, Stardew Valley × Hollow Knight hybrid aesthetic, warm earthy palette (browns, oranges, soft yellows) with deep purple accents and pale blue wings, single color black outline, basic shading, no anti-aliasing."

#### `char/manager-default` — Outgoing sales lead

| Field | Value |
|---|---|
| Hair | red short with one golden-yellow streak |
| Clothing | bright orange-red scarf around neck, crisp white button-up, black trousers |
| Hand prop (S facing) | clipboard + pen |
| Posture | upright confident, hands clasped front |
| firefly anatomy override | none — default |
| Skin tone | neutral mid |

PixelLab prompt:
> "Pixel art anthropomorphic firefly character — sales manager. Dark purple torso (firefly body), 2 thin black antennae on head, sparse-pixel pale-blue wings flanking the back, glowing yellow lantern abdomen at lower rear. Wearing bright orange-red scarf, white button-up shirt, black trousers, with a Bluetooth earpiece on left ear. Red short hair with one golden-yellow streak. Holding a clipboard and pen. Confident upright posture, hands clasped front. Low top-down isometric, 24×24 px sprite, Stardew Valley × Hollow Knight hybrid aesthetic, warm earthy palette with deep purple body and pale blue wings, single color black outline, basic shading, no anti-aliasing."

#### `char/employee-default` — Maker / engineer

| Field | Value |
|---|---|
| Hair | dark short |
| Clothing | dark purple hoodie (matches torso, layered effect), khaki pants, backpack |
| Accessory | bright orange-framed glasses, large over-ear headphones |
| Hand prop (S facing) | open laptop with yellow-glowing screen |
| Posture | head-down focus |
| firefly anatomy override | none — default |
| Skin tone | neutral mid |

PixelLab prompt:
> "Pixel art anthropomorphic firefly character — software engineer. Dark purple torso (firefly body, layered under hoodie of same color), 2 thin black antennae on head, sparse-pixel pale-blue wings flanking the back, glowing yellow lantern abdomen at lower rear. Wearing dark purple hoodie, khaki pants, shoulder backpack. Bright orange-framed glasses, large over-ear headphones. Dark short hair, neutral skin. Holding an open laptop with yellow-glowing screen. Focused head-down posture. Low top-down isometric, 24×24 px sprite, Stardew Valley × Hollow Knight hybrid aesthetic, warm earthy palette with deep purple and pale blue accents, single color black outline, basic shading, no anti-aliasing."

#### `char/auditor-default` — Severe scholar

| Field | Value |
|---|---|
| Hair | silver-white short |
| Clothing | grey wool vest, white shirt, bright orange bow tie |
| Accessory | round gold-rimmed glasses |
| Hand prop (S facing) | quill pen with glowing yellow tip + small parchment scroll |
| Posture | upright, left hand behind back |
| firefly anatomy override | none — default |
| Skin tone | neutral light |

PixelLab prompt:
> "Pixel art anthropomorphic firefly character — old-fashioned scholar auditor. Dark purple torso (firefly body), 2 thin black antennae on head, sparse-pixel pale-blue wings flanking the back, glowing yellow lantern abdomen at lower rear. Wearing grey wool vest, white shirt, bright orange bow tie, with round gold-rimmed glasses. Silver-white short hair, neutral skin. Holding a quill pen with glowing yellow tip and a small parchment scroll. Upright posture, left hand behind back. Low top-down isometric, 24×24 px sprite, Stardew Valley × Hollow Knight hybrid aesthetic, warm earthy palette with grey accents and pale blue wings, single color black outline, basic shading, no anti-aliasing."

V0.2 extends to 16 archetypes via palette-swap shader (skin tone, hair colour, scarf colour) without adding new sprites.

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
| HR3 | All sprites have pivot at exact `(12, 24)` (character, v2.0) or `(centre, bottom)` for objects | Old theater pivots were eyeballed, characters jittered when entity y-sorted |
| HR4 | Every animation frame count and fps follows §1 + §3.3 tables | Old theater had idle = 6 frames in some chars, 4 in others |
| HR5 | All shadows are the same elliptical primitive, not redrawn per character | Old theater had hand-drawn shadows that varied |
| HR6 | All directions use mirror trick (E→W, NE→NW, SE→SW); never PixelLab a mirror direction separately | Old theater had subtle asymmetries between left/right walking |
| HR7 | Reject and re-roll any asset that doesn't pass automated QA (palette / size / pivot / transparency) | Old theater accepted whatever PixelLab returned |
| HR8 | No partial-alpha pixels anywhere | Stardew style has hard outlines; soft alpha looks "blurry" against tilemap |
| HR8a | **Wings use sparse-pixel translucency**: 1px outline (ramp 5 mid) + interior dots at ~30 % density (ramp 5 light), rest transparent. Never alpha-blend wings. | v2.0 adds firefly wings; preserves HR8 |
| HR9 | **Every character carries the firefly anatomy**: 2 antennae + sparse-pixel wings + glowing lantern abdomen + dark-purple torso. No "human only" employees. | v2.0 brand DNA — the character body IS the brand |
| HR10 | **Lantern abdomen colour is fixed to ramp 3** (`#7a5a1a / #c89a3a / #f0c75e / #fae8a8`). Never tinted away from yellow. | Brand readability — lantern colour is the firefly tell |
| HR11 | **Lantern animation matches state**: idle pulses, walk steady, work dim+burst, talk double-pulse | Players read entity state from lantern rhythm, not just sprite frame |

These rules are encoded in `scripts/scene/validate-asset-qa.mjs` and run as merge gate.
