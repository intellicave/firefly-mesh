# /scene — Engineering Rules (red lines)

These rules are PR-blocking. Reviewers may quote rules by number. Violations roll back. They exist because the rejected MultiAgent `/theater` violated each of them, and the result was the "粗糙" the user explicitly does not want repeated.

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

## R10 — Mirror trick for opposing directions

> Only N, NE, E, SE, S directions are PixelLab-generated. W, NW, SW are runtime mirrors of E, NE, SE in `AnimationSystem`. **Never** generate a separate sprite for a mirrorable direction.

This guarantees perfect symmetry; old theater had subtle asymmetries because each direction was generated independently.

**Enforcement**: `production-list.yaml` schema validates direction set ⊆ {N, NE, E, SE, S}. CI rejects any character with W/NW/SW listed.

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

> Per art bible § 1:
> - idle: 6 fps
> - walk: 8 fps
> - work: 4 fps
> - talk: 6 fps

No per-asset variations. Old theater had idle 4 fps in some chars and 6 in others — it looked broken.

**Enforcement**: `production-list.yaml` schema; QA gate validates frame count matches anim type's expected count.

## R15 — Sprite pivot is sacred

> Every character sprite has pivot at `(8, 24)`. Every object sprite has pivot at `(centre, bottom)`. ±1 px tolerance.

This guarantees y-sort works correctly: characters whose feet are lower in screen space appear in front. Old theater's pivots drifted, leading to "characters teleporting half a tile" when entering rooms.

**Enforcement**: `validate-asset-qa.mjs` checks for transparent pivot dot at expected coords.

## R16 — Single shadow primitive

> All character shadows are the same elliptical primitive (10×2 px, dark-purple `#2c1f3a`, 50% opaque), composited at runtime. **Never** bake shadow into the character sprite.

**Enforcement**: QA gate rejects character sprites that contain shadow pixels (rule: bottom row 23 must be transparent except for declared body pixels).

## R17 — Production-list lifecycle gates

> An asset moves through states `queued → producing → qa-passed → shipped`. Skipping a state is forbidden.

**Enforcement**: production driver script (`scripts/scene/produce.mjs`) is the only path; manual edits to status fields are caught by CI lint.

---

## Rule violations: how to handle

A PR that violates any rule is **blocked at CI**. To merge it, one of:

1. **Fix the violation** (preferred — that's why the rule exists)
2. **Bump the rule** (if rule is genuinely wrong; requires PR description justification + maintainer review)
3. **Document the exception** (rare; example: V0.2 introduces mobile scene which exempts R12 with new mobile-specific rules)

Rules are not arbitrary. Each one has a documented failure mode it prevents — most cited via "old theater did X, this rule prevents repeat".
