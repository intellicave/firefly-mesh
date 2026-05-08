# /scene — Engineering Rules (red lines)

These rules are PR-blocking. Reviewers may quote rules by number. Violations roll back. They exist because the rejected MultiAgent `/theater` violated each of them, and the result was the "粗糙" the user explicitly does not want repeated.

> **v3.0 sync (2026-05-08)**: R10 (mirror trick) repealed for characters because the v3.0 PixelLab firefly-folk library ships all 8 directions natively with subtle anatomy differences that mirroring would lose; R15 (pivot) tightens to per-archetype pivot ±2 px instead of fixed (8,24); R16 (shadow) updated for external-library chars that bake shadow into source sprite. New rules R18 (iso-angle Hough gate, HR12), R19 (3-layer occlusion ownership), R20 (chars source from external library only).

## R1 — Single source of truth for art

> All visual assets must derive from `docs/art/firefly-mesh-art-bible.md` and pass through `scripts/scene/validate-asset-qa.mjs`.

No hand-pasted PNGs. No PixelLab calls outside the production pipeline. No edits to assets in `public/scene/assets/` without a corresponding production-list entry.

**Enforcement**: CI job rejects PRs that touch `public/scene/assets/` without matching `production-list.yaml` entry.

## R2 — Master style reference is the contract

> Every PixelLab call must include `reference_image: docs/art/style-reference.png`. Every call must use the master `palette.png`.

**Enforcement**: `scripts/scene/pixellab-character.mjs` enforces this at the call site; calls without these parameters error out before reaching PixelLab.

## R3 — Deterministic seed per asset

> Each production-list entry's `seed` is `sha256(id).first8hex` — auto-derived. Never hand-set.

This guarantees fresh-checkout reproducibility. `pnpm scene:produce-queued` from a clean repo produces byte-identical assets if `production-list.yaml` is unchanged.

**Enforcement**: PR check verifies seeds match formula.

## R4 — File-size caps per directory

> Per `design.md` § 4:
> - `scene/scene/*.ts` ≤ 250 lines
> - `scene/systems/*.ts` ≤ 200 lines
> - `scene/entities/*.ts` ≤ 150 lines
> - `scene/page.tsx` ≤ 50 lines
> - `lib/scene/*.ts` ≤ 150 lines

**Enforcement**: ESLint `max-lines` rule per glob in `packages/web/eslint.config.mjs`. PR fails on violation.

The old theater's `OfficeWorldScene.ts` was 771 lines — the entire reason for this rule.

## R5 — Phaser objects never write to TanStack Query

> Files matching `components/scene/**/*.ts` (engine code, no `.tsx`) cannot import `useQuery`, `useMutation`, `queryClient`, or fetch APIs.

Scene is a derived view; mutations originate from React handlers responding to `SceneEventBus` events.

**Enforcement**: ESLint `no-restricted-imports` boundary rule.

## R6 — No direct Phaser asset loading outside AssetRegistry

> Files matching `components/scene/scene/*.ts` and `components/scene/entities/*.ts` may not call `this.load.image`, `this.load.spritesheet`, `this.load.atlas`. Asset loading is `AssetRegistry`'s sole responsibility.

This guarantees one source of truth for what's loaded and lets us add cross-cutting concerns (preload progress, manifest checksums, lazy load, hot reload) in one place.

**Enforcement**: ESLint custom rule `no-direct-phaser-load`.

## R7 — Manifest checksum gate at boot

> `BootScene.preload()` must validate `manifest.json` SHA-256 before any other asset loads. On mismatch, scene fails fast with reload prompt.

This catches:
- An asset was edited but manifest wasn't regenerated
- Production list and shipped assets drifted
- A user is running an older bundle vs newer manifest (deployed incrementally)

**Enforcement**: implemented in `BootScene`; covered by smoke test.

## R8 — Three-view scene composition

> View composition rules (per `design.md` § 5):
> - `OrgScene` is **always alive** while `/scene` is mounted
> - `TaskScene` is **start/stop on demand**, never running alongside another non-overlay scene
> - `A2AOverlayScene` is **additive overlay**, can run concurrently with Org or Task

**Enforcement**: only `SceneRouter` calls `scene.start/stop/sleep/wake`. ESLint forbids `scene.start()` outside `SceneRouter.ts`.

## R9 — No partial-alpha pixels

> Stardew style is hard pixels. Post-process strips intermediate alpha (threshold 128). QA gate rejects assets with partial-alpha pixels.

**Enforcement**: `validate-asset-qa.mjs` step "alpha edges".

## R10 — Mirror trick for opposing directions (REPEALED for characters in v3.0)

> **v3.0 status**:
> - **Characters**: REPEALED. The 10-archetype PixelLab firefly-folk library ships all 8 directions natively with subtle anatomy differences (wing tilt, lantern angle, head turn) that mirroring would lose. `production-list.yaml` character entries declare `directions: [N, NE, E, SE, S, SW, W, NW]` — all 8 native.
> - **Tiles / objects with no left/right asymmetry**: still applicable. e.g. `tile/wall-corner-NW` and `tile/wall-corner-NE` are *not* mirrored (lighting asymmetry); but `furn/plant-small` may be flipped freely without visual harm.
> - **Walls explicitly forbidden from mirror**: `tile/wall-side-W` and `tile/wall-side-E` must be generated independently (lighting/highlight asymmetry).

The original failure mode (subtle asymmetry across mirrored frames) is now solved upstream by sourcing chars from a curated PixelLab library where 8-dir consistency was verified at curation time.

**Enforcement**: production-list schema validates `directions` against `type` — chars MUST list all 8; walls MAY mirror only if explicitly tagged `mirror_safe: true` (no walls qualify).

## R11 — Reduced motion honored

> All animations must respect `prefers-reduced-motion: reduce`:
> - View transitions: 0ms (hard cut)
> - Idle bob: disabled
> - Particles: static (line visible, dot at midpoint)
> - Walk anim: still plays (it's the entity's primary state indicator)
> - Sticky-note flight: instant teleport

**Enforcement**: smoke test runs once with `prefers-reduced-motion: reduce` set, asserts animations skip.

## R12 — No mobile compromises in V1

> V1 is desktop-only (≥768px). Below that, show a placeholder. Do not "scale down" pixel art — fidelity loss at small sizes is worse than no pixel scene.

V0.2 may add a mobile-specific scene (smaller cast, different camera).

**Enforcement**: `<PhaserGame>` rendered with `hidden md:block`; placeholder with `md:hidden`. Lint rule blocks any responsive scaling on Phaser canvas.

## R13 — Bundle isolation

> `phaser` and all `components/scene/**` code must be dynamic-imported. Other dashboard routes must have **0 KB** delta when scene is added.

**Enforcement**: bundle analyzer in CI; alarm if any common chunk grows.

## R14 — One canonical animation framerate per anim type

> Per art bible § 3.4 (v3.0):
> - `idle-{dir}` / `breathing-idle`: 6 fps (4 frames per loop)
> - `walk-{dir}`: 8 fps (6 frames per loop)
> - `work-s`: 4 fps (4–6 frames; reuses idle-s frames + lantern overlay)
> - `talk-s`: 6 fps (placeholder = idle-s + double-pulse lantern overlay)

No per-asset variations. Old theater had idle 4 fps in some chars and 6 in others — it looked broken.

V3.0 note: PixelLab `breathing-idle` is the canonical alias for our `idle` anim; downloader script renames frames to engine-native `idle-{dir}-{n}` form.

**Enforcement**: `production-list.yaml` schema; QA gate validates frame count matches anim type's expected count.

## R15 — Sprite pivot is sacred (v3.0: per-archetype, ±2 px)

> **Tiles**: pivot is the declared `anchor` field in `production-list.yaml` (e.g. floor tiles bottom-centre `(32, 32)`; walls bottom-centre `(32, 96)`). ±1 px tolerance.
> **Characters**: pivot is the **detected** feet-centre auto-written by `download-pixellab-character.mjs` per archetype (different canvas sizes 116/120/124 px have different pivots). ±2 px tolerance vs the expected canvas-bottom-centre.

This guarantees y-sort works correctly: characters whose feet are lower in screen space appear in front. Old theater's pivots drifted, leading to "characters teleporting half a tile" when entering rooms.

**Enforcement**: `validate-asset-qa.mjs` reads each manifest entry's `pivot` and verifies actual non-transparent feet-centre matches within tolerance. Failed pivot blocks merge.

## R16 — Shadow handling (v3.0: source-baked OK for external chars)

> **Tiles + V0.2+ chars produced by us**: All character shadows are the same elliptical primitive (10×2 px scaled to canvas, dark-purple `#2c1f3a`, 50% opaque), composited at runtime. **Never** bake shadow into the character sprite when we control the generation.
> **V1 external-library chars**: PixelLab firefly-folk library has shadow baked into the source sprite. This is acceptable for V1 because re-rolling 10 chars to strip baked shadow would cost ~80 generations and the curated library has already been quality-accepted. Post-process **does not** strip baked shadow from external-library chars.

**Enforcement**:
- Tiles: QA gate rejects tiles with shadow pixels in the layer-2 region (chars stand on layer-1 floor; shadow belongs to chars).
- Self-generated chars: QA gate rejects char sprites that contain shadow pixels at row `(canvas_h - 1)`.
- External-library chars: shadow check **skipped**; manifest tags entry `shadow_baked: true` so engine knows not to composite an additional runtime shadow.

## R17 — Production-list lifecycle gates

> An asset moves through states `queued → producing → qa-passed → shipped`. Skipping a state is forbidden.
>
> **v3.0 addition**: external-library characters use a special path `external-library → downloading → qa-passed → shipped` (no `producing` because we don't generate them — `download-pixellab-character.mjs` runs in place of `produce.mjs` for these entries).

**Enforcement**: production driver script (`scripts/scene/produce.mjs`) and downloader (`download-pixellab-character.mjs`) are the only paths; manual edits to status fields are caught by CI lint.

## R18 — Iso-angle Hough gate (v3.0; HR12 in art bible)

> Every tile sprite (`type: floor` or `type: wall`) must pass `validate-iso-angle.mjs`: Hough line transform on the bottom 1/3 of the sprite returns dominant edge angle within ±2° of canonical iso 30°.

This catches the v2.0 failure mode where some PixelLab room PNGs were 22.5° (2:1 dimetric) and others 30° (true iso); placing them adjacent looked broken. v3.0's tile-based composition only works if every tile passes the same angle check.

**Enforcement**: `validate-iso-angle.mjs` runs as a sub-step of `validate-asset-qa.mjs` for tile types. Failure exits with code 12 and a specific "tile/X: floor angle drifted Y° from canonical 30°" message. Reference test asset (a synthetic 22.5° tile) verifies the gate actually fails when expected.

## R19 — 3-layer occlusion ownership (v3.0)

> The 3-layer scene structure (backWalls / entitiesFloor / frontOccluders) is owned exclusively by `OcclusionSystem`. Entities (`EmployeeEntity`, `Tile`, `TaskNote`, `A2ALine`) **never** call `setDepth()` directly.

This guarantees:
1. No z-fighting between entities that "compete" for the same depth value
2. Silhouette-ghost rendering for chars behind walls (the "X-ray ghost" visual the user requested) only works if depths are coordinated
3. New occluder types can be added in one place

**Enforcement**: ESLint custom rule forbids `setDepth(` outside `systems/OcclusionSystem.ts`. Visual regression test verifies char-behind-wall produces correct silhouette and char-in-front-of-desk produces correct partial occlusion (lower body behind chair backrest).

## R20 — Characters source from external PixelLab library only (v3.0)

> V1 character sprites MUST NOT be generated by us. Every character entry in `production-list.yaml` has `status: external-library` and a `pixellab_id` UUID pointing to the user's curated PixelLab firefly-folk library. `download-pixellab-character.mjs` is the sole channel for character sprite ingestion.

The library is the user's quality bar — the v3.0 art bible §3.2 explicitly defers to it after the v2.0 24×24 Stardew sprites were rejected. Re-rolling chars in V1 would diverge from the accepted style.

**Enforcement**: `production-list.yaml` schema forbids `status: queued` on character entries; only `external-library` is permitted. Pipeline `produce.mjs` skips entries with `status: external-library` (they go through the downloader instead). V0.2+ may relax this for archetype palette-swap shaders applied to existing sprites (still no fresh PixelLab generations).

---

## Rule violations: how to handle

A PR that violates any rule is **blocked at CI**. To merge it, one of:

1. **Fix the violation** (preferred — that's why the rule exists)
2. **Bump the rule** (if rule is genuinely wrong; requires PR description justification + maintainer review)
3. **Document the exception** (rare; example: V0.2 introduces mobile scene which exempts R12 with new mobile-specific rules)

Rules are not arbitrary. Each one has a documented failure mode it prevents — most cited via "old theater did X, this rule prevents repeat".
