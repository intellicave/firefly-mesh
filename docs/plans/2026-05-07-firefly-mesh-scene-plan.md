# /scene — Implementation Plan

Phased milestones with hard acceptance criteria. Each phase commits independently. Total V1 estimate: **3 weeks** for one engineer with AI assistance.

## Phase 0 — Foundations (week 0, before any asset)

> **Gate**: nothing visual is produced until these ship. This is the "粗糙 prevention" gate.

### M0-1 Art Bible + Production List committed ✓

- **status**: ✅ done (this PR)
- `docs/art/firefly-mesh-art-bible.md`
- `docs/art/production-list.yaml`
- `docs/art/production-pipeline.md`

### M0-2 Scripts: palette + style-reference generators

- **acceptance**:
  - [ ] `scripts/scene/build-palette-png.mjs` emits `docs/art/palette.png` (32×1, indexed, byte-stable across runs)
  - [ ] `scripts/scene/build-style-reference.mjs` calls PixelLab + composes master ref
  - [ ] `pnpm scene:build-foundation` runs both, idempotent
  - [ ] After human approval of generated style reference, `palette.png` and `style-reference.png` are committed
  - [ ] `pnpm typecheck` clean

### M0-3 QA gate + production driver

- **acceptance**:
  - [ ] `scripts/scene/validate-asset-qa.mjs` rejects: out-of-palette, wrong size, wrong pivot, partial-alpha, wrong outline
  - [ ] `scripts/scene/post-process.mjs` runs: quantize → pivot validate → crop → outline replace
  - [ ] `scripts/scene/pixellab-character.mjs` reads `production-list.yaml`, runs steps 1–3
  - [ ] `scripts/scene/build-asset-manifest.mjs` emits `manifest.json` with sha256 checksum
  - [ ] One canonical asset (`char/ceo-default` S-facing idle) is produced end-to-end and merged
  - [ ] `pnpm typecheck` clean

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

### M1-2 OrgScene baseline

- **files**:
  - `packages/web/components/scene/scene/OrgScene.ts`
  - `packages/web/components/scene/entities/EmployeeEntity.ts`
  - `packages/web/components/scene/entities/DepartmentRoom.ts`
  - `packages/web/components/scene/systems/AnimationSystem.ts`
- **acceptance**:
  - [ ] OrgScene renders 1 room (room/ceo-office) + 1 employee (char/ceo-default S-idle)
  - [ ] Employee idle animation loops at 6 fps with hard cuts (no frame interpolation)
  - [ ] `prefers-reduced-motion` honored (idle bob disabled)
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

### M2-2 4 character archetypes (5 directions × 4 anims)

- **acceptance**:
  - [ ] All 80 character PixelLab calls succeed (or reach max retries with manual escalation)
  - [ ] All 280 character frames pass QA gate
  - [ ] Atlas `characters.atlas.png` packs all frames in ≤1024×1024
  - [ ] Mirror trick verified for W/NW/SW directions in `AnimationSystem`

### M2-3 4 rooms + 2 hallway tiles

- **acceptance**:
  - [ ] All 4 room backgrounds pass QA gate
  - [ ] Desk slot positions verified (transparent dot at declared coords)
  - [ ] Hallway tiles tile horizontally without seams
  - [ ] Atlas `rooms.atlas.png` packs all in ≤1024×512

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

## Total V1 effort estimate

| Phase | Calendar | Eng-days |
|---|---|---|
| Phase 0 — Foundations | week 0 | 2 |
| Phase 1 — Engine | week 1 | 5 |
| Phase 2 — Assets | week 2 (parallel with Phase 1's tail) | 4 |
| Phase 3 — Views | week 3 | 5 |
| Phase 4 — Polish | week 3 end | 3 |
| Phase 5 — Production gates | continuous | 1 |
| **Total** | **~3 weeks** | **20 eng-days** |

## Risk-driven re-estimate

If R1 (PixelLab consistency) bites hard: +3 days for 2 extra re-roll cycles + manual touch-ups.
If R5 (SSE desync) bites: +2 days for race-condition test harness.
**Worst-case V1: 25 eng-days (5 weeks).**

V0.2 backlog (out of V1):
- 16 character archetypes (palette swap shader)
- Audit replay view (CRT filter + time scrubber)
- Mobile pixel scene
- Onboarding tour ("the office wakes up")
