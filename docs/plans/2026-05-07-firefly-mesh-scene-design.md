# /scene — Design

Architecture, three-view rendering strategy, data flow, file layout. Implementation contract.

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

**Camera**: orthographic with 30° pitch, 2:1 dimetric isometric. Dynamic zoom 0.5×–2.5× (mouse wheel).

**Layout**: a single office floor, room layout derived from `/api/org/graph`:

- Centre-top: CEO room (1 room per `role=owner`, fallback to `role=admin`)
- Left wing: 1 room per `department`, sized to membership
- Right wing: spillover (employees with no department) labelled "Floor"
- Connecting hallway with floor-tile walking surface

**Entities**:
- `DepartmentRoom` — one per department (or implicit "Unassigned" room). Background image is from `art/firefly-mesh-art-bible.md` § rooms. Each has 4 collider walls + a doorway tile.
- `EmployeeEntity` — one per active employee. Spawns at their department's pre-assigned desk slot. Default state = `idle`. Periodic state change to `walk-to-water-cooler` and back (gives ambient life).
- Each entity has hit-area = its sprite bounding box; click emits `employeeClick {employeeId}`.

**Animations**:
- `idle` (4 frames @ 6fps, looping) — desk-slot rotation, blinks
- `work` (6 frames @ 4fps) — desk-slot, hands typing
- `walk-{N|NE|E|SE|S|SW|W|NW}` (8 frames @ 8fps) — pathfinding driven
- `talk` (4 frames @ 6fps) — when standing next to another employee

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
  DepartmentRoom.ts                     (100 — background + walls + doorway)
  TaskNote.ts                           (80  — sticky note + bezier flight)
  A2ALine.ts                            (80  — bezier line + particle trail + colour)

packages/web/components/scene/systems/
  AssetRegistry.ts                      (200 — manifest load + lazy + cache + QA)
  AnimationSystem.ts                    (180 — state machine + 8-direction picker)
  DataBindingSync.ts                    (200 — TQ cache observer + diff & patch)
  Pathfinder.ts                         (100 — wraps phaser-easystar)
  CameraDirector.ts                     (150 — view follow / smooth zoom / pan)

packages/web/lib/scene/
  event-bus.ts                          (100 — typed pub/sub, mitt-based)
  data-bindings.ts                      (150 — React-side bridge, mounts/unmounts)
  query-keys.ts                         (50  — shared query keys for TQ→scene)

packages/web/public/scene/
  assets/manifest.json
  assets/atlas/                         (sprite atlases, machine-built)
  assets/rooms/                         (room background images)
  assets/characters/                    (character sprite sheets)
  assets/effects/                       (particles, light trails)

scripts/scene/
  build-asset-manifest.mjs
  validate-asset-qa.mjs
  pixellab-character.mjs
  pixellab-room.mjs
  build-sprite-atlas.mjs

docs/art/
  firefly-mesh-art-bible.md
  production-pipeline.md
  production-list.yaml
  style-reference.png                   (master ref, all PixelLab calls cite)
```

**Total source lines budget V1**: ~3000 (engine + systems + page + toolbar + lib).

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

### 8.4 Asset QA gate (scripts/scene/validate-asset-qa.mjs)

Pre-merge gate run by CI on every asset PR:

- Each PNG must use only colours from `style-reference.palette.png`
- Sprite dimensions match declared in `production-list.yaml`
- Pivot point (defined as transparent dot at known coords) is exactly at expected coord
- Edge transparency: no semi-transparent edge pixels (Stardew style is sharp)
- Frame count for animations matches manifest

Failed gate blocks merge. Passing gate produces a `.qa-passed` sidecar file.

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
