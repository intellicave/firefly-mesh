# /scene — UI / UX

User-facing flows. Every interaction in the pixel world maps to an existing dashboard surface.

## 1. Page chrome

The `/scene` route uses the existing dashboard `<AppShell>` (TopBar + Sidebar). The main area is replaced by the pixel scene + a thin toolbar.

```
┌───────────────────────────────────────────────────────────────────────┐
│  TopBar (firefly-mesh · IC          [Search ⌘K]    🌓 🔔 [WH]  )      │
├──────────┬────────────────────────────────────────────────────────────┤
│ Inbox    │   ┌──────────────────────────────────────────────────────┐ │
│ Audit    │   │ Scene · 4 employees · 2 departments      [Org][Task] │ │
│ Org      │   │                              [A2A overlay: ●]        │ │
│ Knowl…   │   ├──────────────────────────────────────────────────────┤ │
│ Skills   │   │                                                      │ │
│ Scene ●  │   │            ╔═══════════════════╗                     │ │
│ Settings │   │            ║   PIXEL  CANVAS   ║                     │ │
│          │   │            ║                   ║                     │ │
│ ────     │   │            ╚═══════════════════╝                     │ │
│ Wenxuan  │   │                                                      │ │
│ Owner    │   └──────────────────────────────────────────────────────┘ │
│          │   FPS: 60 · zoom 100% · view: Org · 3 a2a active           │
└──────────┴────────────────────────────────────────────────────────────┘
```

### Sidebar item

Add `Scene` between `Skills` and `Settings`:
```ts
{ href: "/scene", label: "Scene", Icon: Gamepad2 }
```

Lucide icon: **`Gamepad2`** (small enough to read at 14px, signals "playful view").

## 2. SceneToolbar (component above canvas)

Slim 40-px-high bar:

```
┌─────────────────────────────────────────────────────────────────────┐
│ Scene  ·  4 employees · 2 depts · 0 active agents                   │
│                                                  [Org][Task][A2A ●] │
└─────────────────────────────────────────────────────────────────────┘
```

- **Left**: `Scene` heading + live stats (mirrors `/organization` header)
- **Right**: 3-button view toggle group (segmented control)
  - **Org** — default, selected on first load
  - **Task** — opens task picker dropdown if no taskId in URL
  - **A2A** — checkbox-style toggle (additive overlay), shows ● when ON

### Toggle behaviour

| Click | Effect |
|---|---|
| Org → Task | Camera zoom-in animation 600ms; `TaskScene` start; URL updates `?view=task` |
| Task → Org | Camera zoom-out 600ms; `TaskScene` stop; URL `?view` cleared |
| A2A toggle | `A2AOverlayScene` start / stop; URL adds/removes `&a2a=on` |
| Org / Task **and** A2A on simultaneously | Allowed; A2A is additive overlay |

## 3. Empty / loading / error states

### 3.1 Loading

While Phaser boots and assets preload (≤3.5s):

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│           [pulsing 16-pixel firefly icon, animated]                 │
│                                                                     │
│                  Setting up the office…                             │
│                                                                     │
│                  Loading 24 / 47 sprites                            │
└─────────────────────────────────────────────────────────────────────┘
```

Pixel firefly icon is a 16×16 mascot from `art/firefly-mesh-art-bible.md` § mascots. Loading text + progress are HTML overlay (not Phaser yet).

### 3.2 Empty (no employees)

When `/api/org/graph` returns `employees.length === 0`:

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│                       [Network icon, 32×32]                         │
│                                                                     │
│                     Your office is empty                            │
│      Import employees from a CSV to fill the scene with life.       │
│                                                                     │
│                   [Import employees →]   ← link to /onboarding/import
└─────────────────────────────────────────────────────────────────────┘
```

Reuses `<EmptyState>` component already shipped (P1-A).

### 3.3 Error (Phaser crash / WebGL not available)

```
┌─────────────────────────────────────────────────────────────────────┐
│  Scene unavailable                                                  │
│                                                                     │
│  Pixel scene needs WebGL. Try a desktop browser, or [reload]        │
│  to retry.                                                          │
└─────────────────────────────────────────────────────────────────────┘
```

## 4. Click affordances + cursors

### 4.1 Cursor states

| Hover target | Cursor | Effect |
|---|---|---|
| Empty floor | default arrow | nothing |
| Employee sprite | pointer (👆 / lucide MousePointerClick 16×16) | sprite outline glows 1px white, name tooltip shows above head |
| TaskNote | pointer | scale 110%, name tooltip "Task: {title}" |
| A2ALine | pointer | line thickens 50%, type tooltip "request: {summary}" |
| DepartmentRoom doorway | pointer | room dimmed slightly, label "Walk into Sales" (no actual walk in V1) |

### 4.2 Tooltip layout

Tooltip is HTML overlay positioned via Phaser → React translation, so it can use existing `<Tooltip>` shadcn primitive. Limit width 320px.

```
┌──────────────────────────────────────┐
│  Bob Sales Mgr                       │
│  Sales Manager · Sales department    │
│  ● 1 active agent · OpenClaw 2026.4  │
└──────────────────────────────────────┘
```

## 5. Drawer integration (the load-bearing UX promise)

This is **the** integration: pixel-world clicks open the same drawers the user already knows from elsewhere in the dashboard.

| Click target | Drawer opened | Drawer contract |
|---|---|---|
| `EmployeeEntity` | `<AgentDetailDrawer employee={…} agent={…} canEditBoundary={…} />` | Already implemented for `/organization`. No changes. |
| `TaskNote` | `<InboxDrawer selectedId={taskId} selectedKind="task_review" />` (when status=pending_review) OR redirect `/inbox?focus={taskId}` (else) | Existing component; one prop pass-through. |
| `A2ALine` | `<ThreadDrawer threadId={threadId} onClose={…} />` | Existing component from `/audit`. |

The 3 drawers are mounted in `app/(dashboard)/scene/page.tsx`, controlled by React state, opened in response to SceneEventBus events. Pixel canvas remains visible behind the drawer (drawer slides over it).

## 6. URL state (deep linking + back/forward)

URL is the source of truth for view + focus state.

| URL | State |
|---|---|
| `/scene` | Org view default |
| `/scene?view=task` | Task view, no specific task (toolbar shows task picker) |
| `/scene?view=task&taskId=xxx` | Task view focused on `xxx` |
| `/scene?a2a=on` | Org view + A2A overlay |
| `/scene?focus=empId` | Org view, camera centred on employee `empId` |
| `/scene?view=task&taskId=xxx&drawer=open` | Task view + InboxDrawer for that task open |

Pattern matches `/inbox?tab=action&type=request&sort=asc` (already shipped via FP-2). `SceneToolbar` writes URL via `router.replace({}, { scroll: false })`.

## 7. Keyboard shortcuts (V1 minimal)

| Key | Action |
|---|---|
| `O` | Switch to Org view |
| `T` | Switch to Task view |
| `A` | Toggle A2A overlay |
| `Esc` | Close any open drawer |
| `+` / `-` | Camera zoom in / out |
| `0` | Camera reset to default zoom + centre |
| `?` | Show keymap overlay (HUDScene shortcut sheet) |

Bound at `app/(dashboard)/scene/page.tsx` level via global keydown listener (only when `/scene` is active route).

## 8. Animation & motion language

Movement and animation choices that define the "feel":

| Motion | Easing | Duration |
|---|---|---|
| View switch (Org ↔ Task) | `easeInOutCubic` | 600ms |
| Camera follow (TaskScene sticky-note flight) | `easeOutQuad` | tracks sticky-note arrival |
| Sticky note bezier flight | `easeOutQuad` (start fast, settle) | 1400ms per note |
| A2A line trail particle | linear, looping | 2000ms loop |
| Employee idle bob | `sine`, looping | 1800ms |
| Employee walk step animation | linear cycle | 8 frames @ 8fps = 1s |
| Drawer slide-in | inherits shadcn Sheet animation (220ms) | — |
| Tooltip fade | shadcn Tooltip animation (150ms) | — |

`prefers-reduced-motion: reduce` honored: in that mode all view-switch/camera-pan animations are 0ms, sticky-note flight is instant teleport, no idle bob, no particle trail (line stays static). Documented in `art-bible.md` § motion.

## 9. Visual regression triage flow

When a visual-regression test fails:

1. CI posts diff image as PR comment
2. Reviewer eyeballs: is it expected?
3. If expected (intentional change): re-baseline with `pnpm visual:approve`
4. If unexpected (drift): investigate. Most common causes:
   - PixelLab regenerated a sprite and palette drifted → run QA gate locally
   - Animation frame ordering changed → check git diff on spritesheet JSON
   - Tile alignment off-by-1 → camera zoom math changed

Documented in `production-pipeline.md` § triage.

## 10. Mobile / responsive

V1 is desktop only (≥768px). Below that:

```
┌─────────────────────────────────────────┐
│                                         │
│  📱  Pixel scene needs more room        │
│                                         │
│  Open firefly-mesh on your laptop to    │
│  see the office view. The dashboard     │
│  works fine on mobile.                  │
│                                         │
│  [Go to inbox →]                        │
└─────────────────────────────────────────┘
```

Tailwind: `<PhaserGame>` rendered with `hidden md:block`; mobile placeholder with `md:hidden`. No scaling-down attempts; pixel art at small sizes loses fidelity.

## 11. Accessibility minimum

- All clickable Phaser entities have a parallel hidden React DOM element with `role="button"`, `aria-label`, and a focus-visible ring synced to Phaser hit area position. Tab navigation works for keyboard-only users.
- Lucide icon labels in toolbar.
- View switches announce via `aria-live="polite"` region: "Switched to A2A overlay view".
- Reduced-motion honored as in §8.
- Colour-only differentiation avoided: A2A line types have **both** colour + shape suffix (dashed for pending, solid for accepted, particle for live).
