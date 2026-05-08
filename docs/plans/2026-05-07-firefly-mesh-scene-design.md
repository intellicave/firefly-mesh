# /scene — Design

Architecture, three-view rendering strategy, data flow, file layout. Implementation contract.

> **v3.0 sync (2026-05-08)** — design now matches `firefly-mesh-art-bible.md` v3.0:
> true isometric (1:1:1, 30°/45°, regular-hexagonal-cube outline; **not** 2:1 dimetric);
> modular tile-based floor composition (15 tile primitives) replaces integral
> 256×192 room PNGs; characters source from existing 10-archetype PixelLab
> firefly-folk library (8 native dirs, 116/120/124 px canvas); 3-layer scene
> structure (back walls + entities/floor + front-occluder) gives "X-ray ghost"
> occlusion when characters walk behind walls/desks. See bottom of doc for
> full v3.0 delta. Sections 2.1, 4, 5, 8.4 updated to reflect this.

## 1. System architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                    firefly-mesh Next.js dashboard                    │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │  packages/web/app/(dashboard)/scene/page.tsx                   │  │
│  │     ├─ <PhaserGame>          (dynamic import, ssr:false)       │  │
│  │     ├─ <SceneToolbar>        (Org / Task / A2A toggle + stats) │  │
│  │     └─ shared dashboard drawers (reused, not duplicated):      │  │
│  │         <AgentDetailDrawer> / <InboxDrawer> / <ThreadDrawer>   │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                              │                                       │
│                              │ events ↑↓                             │
│                              ▼                                       │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │  SceneEventBus (lib/scene/event-bus.ts) — typed channel        │  │
│  │  out:  sceneReady, employeeClick, taskClick, a2aLineClick,     │  │
│  │        viewChanged, fps                                        │  │
│  │  in:   setView, focusEmployee, focusTask, replayThread         │  │
│  └────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────────┐
│                  Phaser 3 Game (sandbox in <canvas>)                 │
│                                                                      │
│   SceneRouter (boot once, manages active view)                       │
│   ├─ BootScene       — asset preload + manifest hash check           │
│   ├─ OrgScene        — view A: full org floor (always present)       │
│   ├─ TaskScene       — view B: camera follow specific task           │
│   ├─ A2AOverlayScene — view C: light-trail layer (additive)          │
│   └─ HUDScene        — perma-overlay (tooltip, fps, view label)      │
│                                                                      │
│   Entities                  Systems                                  │
│   ├─ EmployeeEntity         ├─ AssetRegistry                         │
│   ├─ DepartmentRoom         ├─ AnimationSystem                       │
│   ├─ TaskNote               ├─ DataBindingSync                       │
│   └─ A2ALine                ├─ Pathfinder (phaser-easystar)          │
│                             └─ CameraDirector                        │
└──────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────────┐
│            firefly-mesh REST API + SSE (existing, no change)         │
│  GET  /api/me, /api/org/graph, /api/task/list,                       │
│       /api/a2a/inbox, /api/audit/threads                             │
│  SSE  inbox.{empId}, audit.org.{orgId}                               │
└──────────────────────────────────────────────────────────────────────┘
```

## 2. View specifications

### 2.1 OrgScene (view A — default, always live)

**Camera**: orthographic, **true isometric (1:1:1)** at 30° elevation / 45° azimuth. Floor tiles render as 64×32 rhombi (60°/120° interior angles); a unit cube outline is a regular hexagon. **Not** 2:1 dimetric — the art bible v3.0 section 1 enforces this and HR12 (Hough angle gate) blocks any tile whose floor edges drift more than ±2° from canonical 30°. Dynamic zoom 0.5×–2.5× (mouse wheel).

**Layout**: a single office floor of an office building, composed at runtime from **15 tile primitives** (8 floor/wall + 7 furniture; see `production-list.yaml` § tiles). The composition is data-driven by `public/scene/floor-plans/v1-default.yaml`; the V1 layout is 12 cols × 9 rows and looks like:

```
                    iso-grid (12 cols × 9 rows of floor tiles)
            col:  0  1  2  3  4  5  6  7  8  9 10 11
    row 0–3:  [── back walls ──][D]  CEO Office  /  Product Maker Space
    row 4:    ← hallway tiles ─────────────────────────────────────────→
    row 5–8:  [── back walls ──][D]  Sales Bullpen  /  Floor Flex
```

`DepartmentRoom` is no longer a single 256×192 PNG; it's a **logical grouping** of floor + wall + furniture tiles whose iso-grid coords come from the floor-plan YAML. Department-to-room mapping is derived from `/api/org/graph`:

- `ceo-office` slot → owner (or admin fallback)
- Department-named rooms (alphabetic) → up to 3 departments, then overflow to `floor-flex`
- Hallway → no occupants; pathfinder transit only

**3-layer scene structure** (for occlusion / "X-ray ghost"):

```
  layer 0 — backWalls    (z = -1000): tile/wall-back, wall-corner-*, doorway-*
  layer 1 — entitiesFloor (z = computed): characters + floor-attached furniture
                                          + tile/floor-* (sorted by isoY, then renderOrder)
  layer 2 — frontOccluders (z = +1000): tile/wall-side-W, wall-side-E,
                                        chair backrests when occupied,
                                        any furniture between camera and char
```

`OcclusionSystem` walks every `EmployeeEntity` each frame; if its bounds intersect a layer-2 occluder, the system spawns / updates a **silhouette ghost** sprite (recoloured outline of the char's current frame, ramp-1 light, alpha 0.55) drawn at z between layer-1 and the occluder. This realises the "人在墙后只显示轮廓" requirement.

**Entities**:
- `DepartmentRoom` — logical aggregator (no sprite of its own); owns its tile composition + desk_slots from floor-plan.yaml. Hit area = union of its floor-tile bounds (clicking empty floor opens the room's drawer in V0.2).
- `EmployeeEntity` — one per active employee. Spawns at the desk_slot deterministically assigned by `OrgScene.placeEmployees()` (owner→ceo-office slot 0; managers→dept first slot; employees→remaining alphabetic; overflow→hallway standee positions). Default state = `idle`. Periodic ambient: `walk-to-water-cooler` and back. Hit area = sprite bbox; click emits `employeeClick {employeeId}`.
- `Tile` — a single sprite at its iso-grid coord, render-ordered by layer + isoY. Not interactive in V1.

**Animations** (from art-bible §3.4 — sourced from existing PixelLab firefly-folk library):

- `idle-{dir}` (4 frames @ 6fps, looping; PixelLab `breathing-idle`) — engine adds lantern-pulse overlay (ramp 3 light → mid → light → mid)
- `walk-{N|NE|E|SE|S|SW|W|NW}` (6 frames @ 8fps; PixelLab `walk`) — pathfinding driven; 8 native directions, NO mirror trick (HR6 repealed for chars in v3.0)
- `work-s` (S-only; reuses idle-s frames) — engine applies "dim + burst" lantern overlay
- `talk-s` (S-only placeholder; reuses idle-s frames) — engine applies "double-pulse" lantern overlay; dedicated frames added in V0.2

Lantern overlay is engine-side (tints colour-masked ramp-3 region per state), not separate sprite frames — saves ~2× sprite production.

### 2.2 TaskScene (view B — camera-follow)

**Trigger**: clicking a task in `<SceneToolbar>` task picker, or auto-triggered when SSE emits `task.dispatched`.

**Behaviour**:
- Spawn TaskNote sprite (sticky note) at the CEO room bulletin board.
- For each subtask in `task.output.decomposition`, spawn a clone of the sticky note, animate it flying along a Bezier curve from CEO's room → through the hallway → to the assignee's desk slot. Stagger 200ms between subtasks.
- Camera pans to follow the **first** sticky note. After 3s of dwell on the assignee, camera returns to OrgScene framing.
- TaskNote has hit-area = sprite bounds; click emits `taskClick {taskId}`.

### 2.3 A2AOverlayScene (view C — additive overlay)

**Trigger**: toggle in `<SceneToolbar>`. When ON, runs concurrently with OrgScene.

**Behaviour**:
- Subscribes to `inbox.{empId}` SSE for live messages, plus initial fetch from `/api/audit/threads?from=now-5min`.
- Each pending/recent A2A message renders as `A2ALine` — a Bezier curve from sender's desk to receiver's desk, with a particle-trail moving along the curve.
- Line colour by message type:
  - `inform` — soft blue
  - `request` — orange (firefly brand)
  - `commit` — green
  - `handoff` — purple
  - `escalate` — red, pulsing
- Click line emits `a2aLineClick {messageId, threadId}`.
- Lines fade after 30s if message is auto-delivered, or persist until HITL approval if pending.

## 3. Data flow

### 3.1 Single source of truth

```
TanStack Query (React) ─┬─► dashboard drawers (existing)
                        │
                        └─► DataBindingSync (Phaser system)
                              │
                              ▼
                          OrgScene / A2AOverlay (subscribers)
```

- `DataBindingSync` listens to TanStack Query cache events. Every cache update produces a diff against the entity registry and patches Phaser entities.
- Phaser **never** writes back to TanStack Query. Click events bubble up via SceneEventBus → React handler → existing TanStack Query mutation (i.e. opening a drawer, not a cache mutation).
- This is the same invariant as `R7` in firefly-mesh's main rules: server is the source of truth, clients are derived views. Here Phaser is the second-tier derived view.

### 3.2 SSE wiring

| Channel | Subscriber | Triggers |
|---|---|---|
| `inbox.{employeeId}` | A2AOverlayScene | Spawn A2ALine animation |
| `audit.org.{orgId}` | OrgScene + TaskScene | Sticky-note fly animation, archive shimmer in CEO office |
| `org.graph.{orgId}` | OrgScene | Diff & patch employee entity (employee added/archived/role changed) |

### 3.3 Initial bootstrap sequence

```
1. /scene mount → BootScene
2. BootScene preloads:
     a. assets/manifest.json (asset registry, gated by hash)
     b. all sprites from manifest
     c. fonts (one bitmap font for HUD)
     d. concurrent fetch of /api/me + /api/org/graph + /api/task/list + /api/a2a/inbox
3. BootScene → SceneRouter.start("OrgScene")
4. OrgScene compose layout from org/graph data
5. SceneEventBus emit("sceneReady")
6. <PhaserGame> tells <SceneToolbar> ready → user can interact
```

## 4. File layout (hard caps in parentheses)

```
packages/web/app/(dashboard)/scene/
  page.tsx                              (50 lines — mount + drawers + toolbar)
  layout.tsx                            (15 lines — inherits from (dashboard))

packages/web/components/scene/
  PhaserGame.tsx                        (60  — Phaser bootstrap + cleanup)
  SceneToolbar.tsx                      (120 — view toggle + stats + task picker)

packages/web/components/scene/scene/
  SceneRouter.ts                        (150 — view switching, scene lifecycle)
  BootScene.ts                          (200 — preload + manifest + bootstrap fetch)
  OrgScene.ts                           (250 — room layout + employee placement + ambient)
  TaskScene.ts                          (200 — task flight + camera follow)
  A2AOverlayScene.ts                    (150 — line spawn / particle / fade)
  HUDScene.ts                           (150 — tooltip + fps + label)

packages/web/components/scene/entities/
  EmployeeEntity.ts                     (150 — sprite + state machine + hit area)
  DepartmentRoom.ts                     (100 — logical aggregator over tiles + desk_slots)
  Tile.ts                               (60  — single tile sprite + layer + isoY z-sort)
  TaskNote.ts                           (80  — sticky note + bezier flight)
  A2ALine.ts                            (80  — bezier line + particle trail + colour)

packages/web/components/scene/systems/
  AssetRegistry.ts                      (200 — manifest load + lazy + cache + QA)
  AnimationSystem.ts                    (180 — state machine + 8-direction picker)
  LanternOverlaySystem.ts               (120 — engine-side lantern colour cycle per state)
  OcclusionSystem.ts                    (180 — front-occluder hit test + silhouette ghost)
  FloorPlanLoader.ts                    (130 — parse floor-plan YAML → tile composition)
  DataBindingSync.ts                    (200 — TQ cache observer + diff & patch)
  Pathfinder.ts                         (100 — wraps phaser-easystar)
  CameraDirector.ts                     (150 — view follow / smooth zoom / pan)

packages/web/lib/scene/
  event-bus.ts                          (100 — typed pub/sub, mitt-based)
  data-bindings.ts                      (150 — React-side bridge, mounts/unmounts)
  query-keys.ts                         (50  — shared query keys for TQ→scene)
  iso-math.ts                           (60  — true-iso projection helpers)

packages/web/public/scene/
  assets/manifest.json
  assets/atlas/                         (sprite atlases, machine-built)
  assets/tiles/                         (15 tile primitives — floor/wall/furniture)
  assets/characters/                    (character sprite sheets — pulled from PixelLab)
  assets/effects/                       (particles, light trails)
  floor-plans/v1-default.yaml           (canonical office-floor layout)

scripts/scene/
  build-palette-png.mjs                 ✓ shipped
  build-style-reference.mjs             — Phase 0 follow-up
  build-iso-grid-reference.mjs          (Stage 2.1 — 256×256 hex grid for tile prompts)
  validate-iso-angle.mjs                (Stage 2.2 — Hough check; HR12 enforcement)
  download-pixellab-character.mjs       (Stage 2.3 — pull existing 10 sprites + auto pivot)
  build-asset-manifest.mjs              ✓ shipped (extends to char animations in 2.4)
  validate-asset-qa.mjs                 ✓ shipped (extends with HR12-15 in 2.2/2.5)
  produce.mjs                           ✓ shipped
  post-process.mjs                      ✓ shipped
  pixellab-tile.mjs                     (Phase 2 — drives the 15 tile create_object calls)
  build-sprite-atlas.mjs                (Phase 2 — pack manifest into atlas)

docs/art/
  firefly-mesh-art-bible.md             ✓ v3.0 (true iso + tile-based + occlusion)
  production-pipeline.md
  production-list.yaml                  ✓ v3.0
  style-reference.png                   (master ref; all PixelLab calls cite)
  iso-grid-reference.png                (NEW v3.0; all tile calls cite this so floor edges
                                         lock to canonical 30°/45° iso angle)
```

**Total source lines budget V1**: ~3500 (engine + systems + page + toolbar + lib; +500 vs v2.0 because occlusion + floor-plan loader + lantern overlay are net-new systems).

## 5. Engine architecture commitments

| # | Commitment | Enforcement |
|---|---|---|
| C1 | Each scene file ≤250 lines, system ≤200, entity ≤150 | ESLint `max-lines` per directory glob |
| C2 | Scenes never `fetch()` directly; data comes through SceneEventBus + DataBindingSync | Lint rule: `no-restricted-imports` for `fetch`, `axios` in `scene/scene/**` |
| C3 | Phaser objects never mutate TanStack Query cache | Lint rule: `no-restricted-imports` for `useQuery`, `queryClient` in `scene/**/*.ts` (TS only, not .tsx) |
| C4 | Scene code does NOT import dashboard pages or routes | Boundary lint rule |
| C5 | One canonical `AssetRegistry`; no scene loads sprites directly via Phaser loader | Lint: forbid `this.load.image / load.spritesheet` outside `BootScene`/`AssetRegistry` |
| C6 | All assets must come from manifest.json (which is the QA-gated output of pipeline) | `BootScene` checksum validates manifest before play |
| C7 | Three views are: OrgScene (always alive) + TaskScene (start/stop on demand) + A2AOverlayScene (parallel, additive) | `SceneRouter` is the only place that calls `scene.start/stop/sleep` |
| C8 | 3-layer scene structure (backWalls / entitiesFloor / frontOccluders) with `OcclusionSystem` driving silhouette-ghost rendering for chars behind layer-2 occluders | `OcclusionSystem` is the sole owner of layer assignments; entities never `setDepth()` themselves |
| C9 | All tile sprites pass HR12 iso-angle Hough check (±2°) and HR15 pivot tolerance (±2 px); chars source from `pixellab_id` external library only (no new char generations in V1) | `validate-iso-angle.mjs` + `validate-asset-qa.mjs` both run pre-merge in CI; `download-pixellab-character.mjs` is the sole channel for char sprites |

## 6. Performance budget

Target hardware: 2020 MacBook Air M1 (low-end laptop), Chrome.

| Metric | Budget | Measure |
|---|---|---|
| Steady-state FPS, OrgScene + A2AOverlay (16 employees, 8 active a2a lines) | ≥58 fps | Phaser DEBUG fps display, screenshot at end of each milestone |
| Initial /scene load (cold cache) | ≤3.5s to interactive | Lighthouse, p95 |
| Bundle delta on `/inbox` route after adding /scene | 0 KB | `next build` chunk inspector |
| `/scene` route gzipped first-paint bundle | ≤1.8 MB (Phaser ~1.5MB + scene code ~0.3MB) | bundle-analyzer |
| Memory (heap) after 5 min idle on `/scene` | ≤200 MB | DevTools memory profiler |

## 7. Error handling

| Error | UX | Recovery |
|---|---|---|
| Asset manifest checksum mismatch | BootScene shows "Style update — refresh required" | Reload page; if persists, fall back to last-good manifest |
| `/api/org/graph` returns empty employees | OrgScene shows "Empty office" placeholder + CTA "Import employees" → `/onboarding/import` | Same as `/organization` empty state |
| SSE channel disconnects | A2AOverlay pauses live updates; reconnect every 5s; backstop full re-fetch every 30s | Same as `/audit` SSE handling |
| Phaser crash (rare) | Error boundary catches, replaces canvas with "Scene crashed — reload" + Sentry capture | Page reload |
| User on browser without WebGL | Show static screenshot + "Pixel scene requires WebGL" message | No fallback view (acceptable degradation) |

## 8. Testing strategy

### 8.1 Unit (vitest)

- `lib/scene/event-bus.ts` — pub/sub correctness, type contract
- `systems/AnimationSystem.ts` — state-machine transitions for known input sequences
- `systems/Pathfinder.ts` — A* on synthetic 8×8 grid, regression cases for diagonal cost / blocked cells
- `entities/A2ALine.ts` — Bezier interpolation snapshot vs golden values

### 8.2 Visual regression (Playwright + Argos / Percy)

Goldens are screenshots of the canvas at deterministic moments:

- Booted OrgScene with 4-employee fixture, frame 0 / 60 / 600 (10s in)
- A2AOverlay with 3-line fixture, frame 60 (mid-trail)
- TaskScene with 5-subtask fixture, frame 30 (sticky-notes mid-flight)

Visual regression catches the most realistic class of bug (palette drift, sprite mis-pivot).

### 8.3 Smoke (Playwright)

```
1. Sign in with seeded user.
2. Navigate /scene.
3. Wait for sceneReady event.
4. Click first employee sprite (deterministic position from fixture).
5. Assert <AgentDetailDrawer> opens.
6. Toggle A2A view.
7. Assert "A2A" label in HUD.
8. Reload, assert state persists in URL (?view=a2a).
```

### 8.4 Asset QA gate (scripts/scene/validate-asset-qa.mjs + validate-iso-angle.mjs)

Pre-merge gate run by CI on every asset PR. Each check maps to an art-bible Hard Rule (HR#).

| HR | Check | Tool |
|---|---|---|
| HR1 | All non-transparent pixels colour-match the 32-colour master palette | `validate-asset-qa.mjs` palette pass |
| HR2 | Sprite dimensions match declared in `production-list.yaml` | `validate-asset-qa.mjs` size pass |
| HR8 | No partial-alpha pixels (only 0 or 255); HR8a translucency uses sparse-pixel pattern, not alpha | `validate-asset-qa.mjs` alpha pass; sparse-pixel sub-check verifies wing region density 30-45% |
| HR12 | All tile floor edges within ±2° of canonical iso 30° (Hough line detection on the bottom 1/3 of each tile) | `validate-iso-angle.mjs` (Stage 2.2) |
| HR15 | Pivot point within ±2 px of expected (auto-detected feet-centre for chars; declared `anchor` for tiles) | `validate-asset-qa.mjs` pivot pass |
| (general) | Frame count for animations matches manifest | `validate-asset-qa.mjs` frame-count pass |

Failed gate blocks merge. Passing gate produces a `.qa-passed` sidecar file under `scripts/scene/reports/<asset-id>/`.

Characters from the external PixelLab library still pass through QA gate after `download-pixellab-character.mjs`: palette tolerance is widened by 1 step to absorb small palette drift in the source library, but pivot/sparse-pixel/alpha checks are strict.

## 9. URL & deep linking

- `/scene` — default Org view
- `/scene?view=task&taskId=xxx` — open with TaskScene focused on specific task
- `/scene?view=a2a` — open with A2A overlay on
- `/scene?focus={employeeId}` — open with camera focused on an employee

`SceneToolbar` is responsible for syncing state → URL via `router.replace` (same pattern as `/inbox` URL state).

## 10. Open questions resolved in spec phase

| Q | A |
|---|---|
| What if employee has no department? | "Floor" room (right wing) — default seating, no walls |
| What if org has 100+ employees? | V1 caps display to first 50, shows "+X more" overlay (capped — perf budget). V0.2 does virtualization. |
| HITL pending visualisation? | Sender desk has a glowing sticky note until HITL resolved (orange pulse). On approve → sticky flies. On reject → sticky burns away. |
| What does Audit view look like? | Audit is **not** a separate view. Audit-mode toggles a CRT-archive filter on OrgScene + plays all events from a chosen time range as a fast-forward replay. **V0.2** — out of V1 scope. |
| Mobile / phone? | V1 desktop only. `<PhaserGame>` shows "Mobile pixel scene coming soon" placeholder under 768px width. |
