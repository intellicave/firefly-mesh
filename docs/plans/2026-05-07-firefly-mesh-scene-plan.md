# /scene — Implementation Plan

Phased milestones with hard acceptance criteria. Each phase commits independently. Total V1 estimate: **3 weeks** for one engineer with AI assistance.

> **v3.0 sync (2026-05-08)**:
> - Art bible bumped to v3.0: true isometric (1:1:1, regular-hexagonal-cube outline), modular tile-based floor composition, 3-layer occlusion structure, characters from existing 10-archetype PixelLab library.
> - Production-list bumped to v3.0: 10 characters (status="external-library", 0 new PixelLab calls), 15 tile primitives (replacing 4 rooms + 2 hallway tiles).
> - **Phase 0.5 inserted** between Phase 0 and Phase 1 to ship v3.0 pipeline upgrades (iso-grid reference, iso-angle Hough gate, character downloader, manifest extension).
> - Phase 1 expanded with M1-2.5 (OcclusionSystem + 3-layer scene structure).
> - Phase 2 milestones swap rooms→tiles and chars→download-not-generate.
> - Total V1 PixelLab calls drop from ~94 to ~24-26 (chars are now zero-cost in V1).

## Phase 0 — Foundations (week 0, before any asset)

> **Gate**: nothing visual is produced until these ship. This is the "粗糙 prevention" gate.

### M0-1 Art Bible + Production List committed ✓

- **status**: ✅ done — v3.0 (2026-05-08)
- `docs/art/firefly-mesh-art-bible.md` (v3.0: true iso + tile-based + occlusion + HR12-15)
- `docs/art/production-list.yaml` (v3.0: 10 chars + 15 tiles)
- `docs/art/production-pipeline.md`

### M0-2 Scripts: palette + style-reference generators

- **acceptance**:
  - [ ] `scripts/scene/build-palette-png.mjs` emits `docs/art/palette.png` (32×1, indexed, byte-stable across runs)
  - [ ] `scripts/scene/build-style-reference.mjs` calls PixelLab + composes master ref
  - [ ] `pnpm scene:build-foundation` runs both, idempotent
  - [ ] After human approval of generated style reference, `palette.png` and `style-reference.png` are committed
  - [ ] `pnpm typecheck` clean

### M0-3 QA gate + production driver ✓

- **status**: ✅ shipped (Phase 0 base; HR1/HR2/HR8/HR15 covered)
- `scripts/scene/validate-asset-qa.mjs` (palette / size / pivot / partial-alpha / outline)
- `scripts/scene/post-process.mjs` (quantize → pivot → crop → outline)
- `scripts/scene/produce.mjs` (orchestrator)
- `scripts/scene/build-asset-manifest.mjs` (sha256 manifest, deterministic)

## Phase 0.5 — v3.0 pipeline upgrades (week 0.5; v3.0 only)

> **Gate**: ships before any tile or character can be produced. These are the
> upgrades the v2.0→v3.0 art-bible bump demands. Lands as one PR after Phase 0.

### M0.5-1 Iso-grid reference generator (Stage 2.1)

- **files**: `scripts/scene/build-iso-grid-reference.mjs`
- **acceptance**:
  - [ ] Emits `docs/art/iso-grid-reference.png` (256×256, 32-colour palette, indexed PNG)
  - [ ] Renders 8×8 array of canonical 64×32 iso rhombi at 30° elevation / 45° azimuth
  - [ ] Edges land at exactly canonical iso angle (30° from horizontal, ±0.5°)
  - [ ] Includes one outlined cube to demonstrate "regular hexagonal cube outline" (HR12 visual reference)
  - [ ] Byte-deterministic across re-runs (no timestamps in PNG metadata)
  - [ ] Committed to repo so all PixelLab tile calls cite same reference

### M0.5-2 Iso-angle Hough gate (Stage 2.2; HR12 enforcement)

- **files**: `scripts/scene/validate-iso-angle.mjs`
- **acceptance**:
  - [ ] Reads any tile PNG, isolates non-transparent edge pixels in bottom 1/3
  - [ ] Runs Hough line transform; returns dominant angle of detected lines
  - [ ] Passes if dominant angle is within ±2° of canonical iso 30° (or 150° = same line, mirror)
  - [ ] Fails with stderr message "tile/X: floor angle drifted Y° from canonical 30°" + exit code 12
  - [ ] Wired into `validate-asset-qa.mjs` as a sub-step for `type: floor`/`type: wall` only (not chars/effects)
  - [ ] Reference test: passes for `iso-grid-reference.png`; fails for a synthetic 22.5° (2:1 dimetric) tile

### M0.5-3 Character downloader (Stage 2.3)

- **files**: `scripts/scene/download-pixellab-character.mjs`
- **acceptance**:
  - [ ] Reads character entries from `production-list.yaml` where `status: external-library`
  - [ ] For each, calls PixelLab `get_character(pixellab_id)` to fetch all 8 directions × all native animations (breathing-idle + walk in V1)
  - [ ] Writes per-frame PNGs to `scripts/scene/raw/<char-id>/<anim>-<dir>-<frame>.png`
  - [ ] Auto-detects pivot per archetype: analyses south-facing first frame, finds bounding-box bottom centre of non-transparent pixels, writes detected `pivot: { x, y }` into manifest
  - [ ] Verifies detected pivot is within ±2 px of expected (HR15 enforcement); fails build if drift
  - [ ] Caches by `pixellab_id` so re-runs are no-op when sprite hasn't changed upstream
  - [ ] Idempotent: running twice produces byte-identical raw outputs

### M0.5-4 Manifest extension for character animations (Stage 2.4)

- **files**: extend `scripts/scene/build-asset-manifest.mjs`
- **acceptance**:
  - [ ] For each character, manifest entry includes:
    - `pixellab_id`, detected `pivot`, `size`, `directions` (8), `animations` (per-dir framecount)
    - frame URIs flat-listed under `frames` for atlas packer
  - [ ] Manifest checksum still byte-deterministic (excludes `generatedAt` from sha256 input — already shipped invariant)
  - [ ] Lantern-region colour mask precomputed per archetype (used by `LanternOverlaySystem` at runtime to know which pixels to tint per state)

### M0.5-5 End-to-end verify (Stage 2.5)

- **acceptance**:
  - [ ] `pnpm scene:download char/firefly-ceo` runs without error
  - [ ] Output passes `validate-asset-qa.mjs` (palette tolerance widened by 1 step for external-library; pivot strict)
  - [ ] Output passes `validate-iso-angle.mjs` ❌ N/A for chars (skipped per type filter)
  - [ ] Manifest contains `char/firefly-ceo` with 8 dirs × ~10 frames each (4 idle + 6 walk per dir = 80 frames)
  - [ ] Re-run produces byte-identical manifest (`sha256` matches)
  - [ ] CEO sprite renders at 116×116 with detected pivot ~(58, 108) ±2 px

### M0.5-6 Phase 0.5 commit

- **acceptance**:
  - [ ] All Phase 0.5 scripts pass typecheck
  - [ ] Single PR `feat(scene-pipeline): v3.0 — iso grid + Hough gate + char downloader`
  - [ ] CI green on the PR

## Phase 1 — Engine skeleton (week 1)

### M1-1 Phaser game mount + Boot scene

- **files**:
  - `packages/web/app/(dashboard)/scene/page.tsx`
  - `packages/web/components/scene/PhaserGame.tsx`
  - `packages/web/components/scene/scene/BootScene.ts`
  - `packages/web/components/scene/scene/SceneRouter.ts`
  - `packages/web/components/scene/systems/AssetRegistry.ts`
  - `packages/web/lib/scene/event-bus.ts`
- **acceptance**:
  - [ ] `/scene` route renders an empty pixel canvas (BootScene loaded, no scene mounted yet)
  - [ ] `BootScene` loads `manifest.json` via `AssetRegistry`, validates checksum
  - [ ] `SceneEventBus` emits `sceneReady` after assets loaded
  - [ ] All files within size caps
  - [ ] `pnpm typecheck` clean

### M1-2 OrgScene baseline (v3.0 tile-based)

- **files**:
  - `packages/web/components/scene/scene/OrgScene.ts`
  - `packages/web/components/scene/entities/EmployeeEntity.ts`
  - `packages/web/components/scene/entities/DepartmentRoom.ts` (logical aggregator)
  - `packages/web/components/scene/entities/Tile.ts`
  - `packages/web/components/scene/systems/AnimationSystem.ts`
  - `packages/web/components/scene/systems/FloorPlanLoader.ts`
  - `packages/web/components/scene/systems/LanternOverlaySystem.ts`
  - `packages/web/lib/scene/iso-math.ts`
  - `packages/web/public/scene/floor-plans/v1-default.yaml`
- **acceptance**:
  - [ ] FloorPlanLoader reads `v1-default.yaml` and instantiates the 12×9 iso-grid of tiles (back walls + floors + furniture) for ceo-office, product-maker, sales-bullpen, floor-flex, hallway
  - [ ] OrgScene renders the full v1 floor with 1 employee (`char/firefly-ceo` S-idle) at the ceo-office desk slot
  - [ ] iso-math.ts converts (col, row) → (screen x, y) at canonical 30°/45° iso and matches HR12 tile angle within ±0.5px
  - [ ] Employee idle animation loops at 6 fps with hard cuts (no frame interpolation); LanternOverlaySystem applies idle pulse (ramp 3 light↔mid)
  - [ ] `prefers-reduced-motion` honored (idle bob + lantern pulse both disabled)
  - [ ] All files within size caps

### M1-2.5 OcclusionSystem + 3-layer scene structure

- **files**:
  - `packages/web/components/scene/systems/OcclusionSystem.ts`
- **acceptance**:
  - [ ] OcclusionSystem assigns each rendered object to one of 3 layers (backWalls / entitiesFloor / frontOccluders) based on its tile type + position relative to camera
  - [ ] Each frame: walks every EmployeeEntity, hit-tests against layer-2 occluder bounds; if intersecting, spawns / updates a silhouette ghost sprite (recoloured outline, ramp-1 light, alpha 0.55) drawn between layer-1 and the occluder
  - [ ] Visual test: walk CEO behind tile/wall-side-W → torso disappears, silhouette outlines instead; walk back out → silhouette gone
  - [ ] Manual sit at desk: chair backrest correctly overlaps lower body
  - [ ] No double rendering, no z-fighting flicker
  - [ ] System owns all `setDepth()` calls — entities never set their own (C8 enforcement)
  - [ ] All files within size caps

### M1-3 DataBindingSync from `/api/org/graph`

- **files**:
  - `packages/web/components/scene/systems/DataBindingSync.ts`
  - `packages/web/lib/scene/data-bindings.ts`
- **acceptance**:
  - [ ] OrgScene re-renders correctly when `useQuery(['org-graph'])` cache updates
  - [ ] New employee in cache spawns new `EmployeeEntity` at default desk slot
  - [ ] Removed employee causes existing entity to walk off-screen + destroy
  - [ ] No memory leaks (verified with 100 add/remove cycles)
  - [ ] Background reconciliation every 30s catches dropped events

### M1-4 SceneToolbar + URL state

- **files**:
  - `packages/web/components/scene/SceneToolbar.tsx`
- **acceptance**:
  - [ ] Toolbar shows live stats (employee count / department count / agent count)
  - [ ] View toggle Org/Task/A2A renders 3 buttons (Task/A2A still no-op)
  - [ ] URL state persists `?view=org` (default omitted), `?view=task`, `?a2a=on`
  - [ ] Refresh / back-forward restores view state
  - [ ] `pnpm typecheck` clean

### M1-5 Click → Drawer integration

- **files**:
  - extend `app/(dashboard)/scene/page.tsx`
- **acceptance**:
  - [ ] Click employee sprite → `<AgentDetailDrawer>` opens with that employee
  - [ ] Drawer reuses existing component; no duplication
  - [ ] Tooltip on hover (HTML overlay synced to Phaser hit area position)
  - [ ] Esc closes drawer; click outside also closes

## Phase 2 — Production assets (week 2, parallel to engine)

### M2-1 Foundation assets shipped

- **acceptance**:
  - [ ] `palette.png` committed
  - [ ] `style-reference.png` committed (after human approval)
  - [ ] Both pass automated lint
  - [ ] `manifest.json` references them

### M2-2 10 character archetypes (download from external library)

- **acceptance**:
  - [ ] `pnpm scene:download-characters` runs `download-pixellab-character.mjs` for all 10 entries with `status: external-library` in production-list.yaml
  - [ ] All ~800 character frames (10 chars × 8 dirs × ~10 frames per dir; breathing-idle + walk) downloaded into `scripts/scene/raw/`
  - [ ] All 800 frames pass QA gate (palette tolerance widened by 1 step; pivot strict ±2 px)
  - [ ] Atlas `characters.atlas.png` packs all frames in ≤4096×4096 (10 chars × 116-124 px is much larger than v2.0's 24px sprites)
  - [ ] Lantern colour-mask region precomputed per archetype and embedded in manifest
  - [ ] PixelLab call cost: **0** (all sprites already shipped in user's PixelLab account); the cost is pure download bandwidth + processing
  - [ ] V3.0: HR6 mirror trick is repealed for chars — no W/NW/SW mirroring needed; all 8 dirs are native

### M2-3 15 tile primitives (replaces 4 rooms + 2 hallway tiles)

- **acceptance**:
  - [ ] `pnpm scene:produce-queued` produces all 15 tile entries from production-list.yaml `tiles:` section:
    - 2 floor tiles (office / hallway, 64×32)
    - 6 wall tiles (back / side-W / side-E / corner-NW / corner-NE / doorway-S, 64×96 or 32×96)
    - 7 furniture tiles (desk-CEO / desk-employee / chair / bulletin / cooler / plant / whiteboard)
  - [ ] Each tile passes `validate-asset-qa.mjs` (HR1/HR2/HR8/HR15)
  - [ ] Each tile passes `validate-iso-angle.mjs` Hough check (HR12 — floor edges within ±2° of 30°)
  - [ ] All 15 tiles cite `iso-grid-reference.png` in their PixelLab `reference_image`
  - [ ] Atlas `tiles.atlas.png` packs all in ≤1024×512
  - [ ] Visual test: place 4 floor tiles in 2×2 grid in test scene → no angle drift between them; cube outline is regular hexagon

### M2-4 6 effects + 4 icons

- **acceptance**:
  - [ ] Sticky notes yellow + orange variants
  - [ ] A2A particle (4-frame pulse)
  - [ ] Mascot firefly (4-frame breathe)
  - [ ] Door arch (2-frame glow)
  - [ ] Desk pending glow (4-frame pulse)
  - [ ] 4 lucide icons rasterised
  - [ ] Atlas `effects.atlas.png` packs all in ≤256×256

## Phase 3 — Three views (week 3)

### M3-1 OrgScene full layout (real org-graph data)

- **acceptance**:
  - [ ] All employees from `/api/org/graph` placed in correct department rooms
  - [ ] Unassigned employees go to floor-flex room
  - [ ] When >50 employees: cap with "+X more" overlay
  - [ ] Camera default zoom shows whole floor; pan by mouse drag; zoom by wheel
  - [ ] FPS ≥58 with 16 employees + 0 a2a active

### M3-2 TaskScene + sticky-note flight

- **files**:
  - `packages/web/components/scene/scene/TaskScene.ts`
  - `packages/web/components/scene/entities/TaskNote.ts`
- **acceptance**:
  - [ ] `View=Task` opens task picker
  - [ ] Picking a task triggers fan-out animation: sticky-notes fly from CEO bulletin to each subtask assignee
  - [ ] Camera follows first sticky note; returns to org framing after 3s
  - [ ] Click sticky → opens InboxDrawer / redirects to `/inbox?focus=...`
  - [ ] SSE `audit.org.{orgId}` `task.dispatched` triggers fan-out automatically (when in Task view)

### M3-3 A2AOverlayScene + light trails

- **files**:
  - `packages/web/components/scene/scene/A2AOverlayScene.ts`
  - `packages/web/components/scene/entities/A2ALine.ts`
- **acceptance**:
  - [ ] Toggle ON: existing pending a2a messages render as bezier lines (sender desk → ceiling apex → receiver desk)
  - [ ] Line colour by message type (5 types × 5 colours from palette)
  - [ ] Pending = dashed + pulse; auto-delivered = solid 50%
  - [ ] Click line → ThreadDrawer
  - [ ] SSE inbox.{empId} spawns new line in real-time
  - [ ] Lines fade after 30s if auto-delivered, persist if pending

### M3-4 SceneRouter + view transitions

- **files**:
  - extend `SceneRouter.ts`, `CameraDirector.ts`
- **acceptance**:
  - [ ] Org → Task transition: 600ms ease-in-out cubic camera zoom
  - [ ] Task → Org transition: 600ms ease-out cubic camera pull-back
  - [ ] A2A toggle never resets camera
  - [ ] Switching views never destroys OrgScene state (always-alive)
  - [ ] Reduced-motion: 0ms transitions (hard cut)

## Phase 4 — Polish + acceptance (week 3 end)

### M4-1 HUDScene + keyboard shortcuts

- **files**:
  - `packages/web/components/scene/scene/HUDScene.ts`
- **acceptance**:
  - [ ] FPS counter (dev-only via NEXT_PUBLIC_DEV_HUD=true)
  - [ ] View label top-right ("Org · A2A overlay on")
  - [ ] Keymap overlay on `?` press
  - [ ] Shortcuts (O / T / A / Esc / + / - / 0 / ?) wired

### M4-2 Empty / loading / error states

- **acceptance**:
  - [ ] Loading screen with mascot + sprite progress count
  - [ ] Empty (0 employees): EmptyState with "Import employees" CTA → /onboarding/import
  - [ ] WebGL unavailable: Error message
  - [ ] Phaser crash: Error boundary + Sentry capture

### M4-3 Mobile placeholder + accessibility

- **acceptance**:
  - [ ] <768px shows "Pixel scene needs more room" placeholder
  - [ ] Tab navigation reaches all clickable entities (parallel hidden DOM buttons)
  - [ ] aria-live announcements on view change
  - [ ] No colour-only differentiation (a2a lines have colour + shape suffix)

### M4-4 Visual regression baselines

- **acceptance**:
  - [ ] 6 golden screenshots committed (`tests/visual/golden/`)
  - [ ] Playwright + pixelmatch CI step passes
  - [ ] Visual regression catches a known palette-drift case

### M4-5 Bundle audit + perf

- **acceptance**:
  - [ ] `next build` chunk inspector confirms 0 KB delta on `/inbox`, `/audit`, `/organization`, `/knowledge`, `/skills`, `/settings`
  - [ ] `/scene` first-paint bundle ≤1.8 MB gzip
  - [ ] FPS ≥58 with 16 employees + 8 active a2a lines on 2020 MacBook Air

### M4-6 README + docs site cross-references

- **acceptance**:
  - [ ] firefly-mesh README adds `/scene` to Features section
  - [ ] One screenshot of pixel scene in README
  - [ ] `docs/plans/index.md` cross-links scene docs

## Phase 5 — Production readiness gates

### M5-1 Smoke tests

- **acceptance**:
  - [ ] Playwright smoke test: sign in → /scene → wait for sceneReady → click employee → drawer opens
  - [ ] Playwright smoke test: toggle A2A → assert overlay rendered
  - [ ] Tests pass in CI on 3 browsers (Chrome / Firefox / Safari)

### M5-2 Asset re-build determinism

- **acceptance**:
  - [ ] Fresh checkout + `pnpm scene:produce-queued` produces byte-identical assets to current `public/scene/assets/`
  - [ ] CI job verifies on every PR

### M5-3 Final review

- **acceptance**:
  - [ ] `/autodev-review --target ui` averaged score ≥ 8/10 across 4 dimensions
  - [ ] No `[ ]` unchecked acceptance criteria above (or each unchecked has explicit blocker note)
  - [ ] Final aggregate scorecard committed

---

## Total V1 effort estimate (v3.0)

| Phase | Calendar | Eng-days |
|---|---|---|
| Phase 0 — Foundations (palette / QA / produce / manifest) | week 0 | 2 (✅ shipped) |
| Phase 0.5 — v3.0 pipeline upgrades (iso-grid + Hough + downloader + manifest ext) | week 0.5 | 2 |
| Phase 1 — Engine (incl. M1-2.5 OcclusionSystem + 3-layer scene) | week 1 | 6 (+1 for occlusion) |
| Phase 2 — Assets (10 chars download + 15 tiles produce) | week 2 (parallel with Phase 1's tail) | 3 (-1 because chars are zero-cost download) |
| Phase 3 — Views | week 3 | 5 |
| Phase 4 — Polish | week 3 end | 3 |
| Phase 5 — Production gates | continuous | 1 |
| **Total** | **~3.5 weeks** | **22 eng-days** |

V3.0 net delta vs v2.0: +2 days (Phase 0.5) +1 day (occlusion) -1 day (chars zero-cost) = +2 eng-days.

## Risk-driven re-estimate

If R1 (PixelLab tile consistency) bites — i.e. some tiles fail HR12 Hough gate even with iso-grid-reference: +2 days for re-roll cycles with manual reference-image tweaking (still cheaper than v2.0 because we're re-rolling tiles not whole rooms).
If R3 (occlusion silhouette quality) bites — silhouette ghost looks bad at certain angles or with multiple stacked occluders: +1 day for refined silhouette generation (e.g. dilated outline instead of recoloured fill).
If R5 (SSE desync) bites: +2 days for race-condition test harness.
**Worst-case V1: 27 eng-days (5.5 weeks).**

V0.2 backlog (out of V1):
- 16 character archetypes (palette swap shader)
- Audit replay view (CRT filter + time scrubber)
- Mobile pixel scene
- Onboarding tour ("the office wakes up")
