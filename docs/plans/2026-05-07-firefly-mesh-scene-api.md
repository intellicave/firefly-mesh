# /scene — API contracts

What firefly-mesh API the scene consumes (read-only) + the internal SceneEventBus protocol.

## 1. Consumed firefly-mesh REST endpoints

Scene is a read-only view, no writes. All endpoints are existing — no schema changes to `firefly-mesh` API surface.

### 1.1 Bootstrap (called once on `/scene` mount)

| Endpoint | Purpose | TanStack Query key |
|---|---|---|
| `GET /api/me` | Resolve viewer's `employeeId`, `orgId`, `role`, `pendingCounts` | `["me"]` (existing key, shared with dashboard) |
| `GET /api/org/graph` | Get full employees / departments / agents map for layout composition | `["org-graph"]` (existing key, shared with `/organization`) |

### 1.2 View-specific data

| View | Endpoint | Use |
|---|---|---|
| Org | (already loaded above) | Layout |
| Task | `GET /api/task/list?employeeId={me}&limit=20` | Show task picker dropdown + recent decompositions |
| Task (focused) | `GET /api/task/{id}` | Subtask list for sticky-note fan-out |
| A2A | `GET /api/a2a/inbox?tab=needs_action&limit=50` | Initial pending lines |
| A2A | `GET /api/audit/threads?from=now-5min&limit=20` | Recent live threads (5-minute scrollback for context) |

All queries inherit existing `staleTime: 30_000`, `refetchInterval: 15_000` from `lib/api-client.ts`.

### 1.3 SSE channels

| Channel | Subscriber | Mounted | Triggers in scene |
|---|---|---|---|
| `inbox.{employeeId}` | A2AOverlayScene + DataBindingSync | When `A2AOverlayScene` is active | Spawn new `A2ALine` for incoming a2a; pulse sender desk for outgoing pending |
| `audit.org.{orgId}` | OrgScene + DataBindingSync | Always (whenever `/scene` mounted) | Spawn `TaskNote` flight on `task.dispatched`, archive shimmer on `audit.entry.appended` |
| `org.graph.{orgId}` | DataBindingSync | Always | Diff & patch employees: add (spawn entity at default desk), archive (entity walks off-screen), role change (badge update) |

SSE consumed via existing `<SSEProvider>` in `lib/scene/data-bindings.ts` — same pattern as `/audit` page already does.

## 2. SceneEventBus protocol

Internal contract between Phaser canvas and React drawers.

### 2.1 Outbound (from Phaser to React)

```ts
type SceneOutboundEvents = {
  sceneReady: void;
  fps: { value: number };
  employeeClick: { employeeId: string };
  taskClick: { taskId: string };
  a2aLineClick: { messageId: string; threadId: string };
  viewChanged: { view: "org" | "task" | "a2a"; a2aOverlay: boolean };
  cameraMoved: { x: number; y: number; zoom: number };
  errorBoundary: { message: string; stack?: string };
};
```

### 2.2 Inbound (from React to Phaser)

```ts
type SceneInboundEvents = {
  setView: { view: "org" | "task"; taskId?: string };
  toggleA2AOverlay: { enabled: boolean };
  focusEmployee: { employeeId: string };
  focusTask: { taskId: string };
  resetCamera: void;
  showKeymap: { visible: boolean };
};
```

### 2.3 Bus implementation

`lib/scene/event-bus.ts`:

```ts
import mitt, { type Emitter } from "mitt";

export type SceneEvents = SceneOutboundEvents & SceneInboundEvents;
export type SceneEventBus = Emitter<SceneEvents>;

let _bus: SceneEventBus | null = null;
export function getSceneBus(): SceneEventBus {
  if (!_bus) _bus = mitt<SceneEvents>();
  return _bus;
}
export function clearSceneBus(): void { _bus = null; }
```

Bus is **module-singleton, lazy-initialised**. Reset on page unmount to avoid event leaks.

## 3. EventBus → drawer wiring

Implemented in `app/(dashboard)/scene/page.tsx`:

```ts
const bus = getSceneBus();

useEffect(() => {
  const handlers: Record<keyof SceneOutboundEvents, (...args: any) => void> = {
    sceneReady: () => setReady(true),
    employeeClick: ({ employeeId }) => setSelectedEmployeeId(employeeId),
    taskClick: ({ taskId }) => router.push(`/inbox?focus=${taskId}`),
    a2aLineClick: ({ threadId }) => setSelectedThreadId(threadId),
    viewChanged: ({ view, a2aOverlay }) => updateUrlParams({ view, a2a: a2aOverlay ? "on" : null }),
    cameraMoved: () => {},
    fps: () => {},
    errorBoundary: ({ message }) => {
      Sentry.captureMessage(`SceneError: ${message}`);
      setErrorState(true);
    },
  };
  Object.entries(handlers).forEach(([k, v]) => bus.on(k as keyof SceneEvents, v));
  return () => Object.entries(handlers).forEach(([k, v]) => bus.off(k as keyof SceneEvents, v));
}, []);
```

Drawer state mounts (existing components):

```tsx
<AgentDetailDrawer
  employee={selectedEmployee}
  agent={selectedAgent}
  open={Boolean(selectedEmployeeId)}
  onOpenChange={(o) => !o && setSelectedEmployeeId(null)}
  canEditBoundary={canEditBoundary}
/>
<ThreadDrawer
  threadId={selectedThreadId}
  onClose={() => setSelectedThreadId(null)}
/>
```

## 4. DataBindingSync system contract

`components/scene/systems/DataBindingSync.ts` — TanStack Query → Phaser entity reflector.

### 4.1 Subscribe pattern

```ts
queryClient.getQueryCache().subscribe((event) => {
  if (event.type !== "updated") return;
  if (event.query.queryKey[0] === "org-graph") {
    diffAndPatchEmployees(event.query.state.data, this.entityRegistry);
  } else if (event.query.queryKey[0] === "a2a-inbox") {
    diffAndPatchA2ALines(event.query.state.data, this.lineRegistry);
  }
});
```

### 4.2 Diff & patch invariants

| Source | Old → new diff | Phaser action |
|---|---|---|
| `org-graph.employees` | new id appears | `OrgScene.spawnEmployee(id)` at default desk |
| `org-graph.employees` | id disappears | `EmployeeEntity.walkOffScreen()` then destroy |
| `org-graph.employees[i].status` | `active`→`archived` | entity dims, walks off-screen, destroy |
| `org-graph.agents` | `agent.status active` for emp | entity badge: green dot |
| `org-graph.agents` | `agent.status inactive` | badge: grey dot |
| `a2a-inbox.items` | new pending message | spawn `A2ALine` (pending style: dashed, pulsing) |
| `a2a-inbox.items` | item leaves array (approved/rejected) | `A2ALine.fade(800ms)` then destroy |

### 4.3 Reconciliation backstop

Every 30s, regardless of cache events: run a full diff between cache and entity registry, log discrepancies, force-correct. Catches lost SSE events / cache invalidation bugs.

## 5. Asset manifest contract

`public/scene/assets/manifest.json` produced by build pipeline:

```json
{
  "version": "1.0.0",
  "checksum": "sha256-...",
  "generatedAt": "2026-05-07T10:00:00Z",
  "palette": "scene/assets/palette.png",
  "atlases": {
    "characters": {
      "image": "scene/assets/atlas/characters.png",
      "json": "scene/assets/atlas/characters.json"
    },
    "rooms": { ... },
    "effects": { ... }
  },
  "characters": {
    "ceo-default": {
      "atlasKey": "characters",
      "frames": {
        "idle-s": ["ceo_idle_s_0", "ceo_idle_s_1", "ceo_idle_s_2", "ceo_idle_s_3"],
        "walk-s": ["ceo_walk_s_0", ...],
        ...
      },
      "pivot": { "x": 8, "y": 16 }
    }
  },
  "rooms": {
    "ceo-office": {
      "atlasKey": "rooms",
      "frame": "room_ceo_office",
      "size": { "w": 256, "h": 192 },
      "entrance": { "x": 128, "y": 184 }
    }
  }
}
```

`AssetRegistry.ts` validates checksum at boot; on mismatch: BootScene fails fast with reload prompt.

## 6. Network / latency assumptions

| Assumption | If violated, behaviour |
|---|---|
| `GET /api/org/graph` returns ≤ 200 employees | V1 caps display to first 50; banner shown |
| `GET /api/audit/threads?from=now-5min` returns ≤ 30 messages | A2A overlay throttles spawn rate; max 12 visible at once, oldest fades |
| SSE latency ≤ 2s in normal network | If >5s, "live mode degraded" badge |
| User on stable network | If `online` event drops, lines pause and resume on reconnect |

## 7. Versioning

Scene version is independent of dashboard version, but always shipped together.

- `scene` chunk version = `manifest.json.version`
- Scene version bumps when art/code changes; minor bump for additive (new asset / new entity), major bump for incompatible (removed asset / changed entity contract)
- Manifest checksum is a hard gate; if asset drifts without manifest version bump, BootScene refuses to load — surfaces as "Style update required, refresh"
