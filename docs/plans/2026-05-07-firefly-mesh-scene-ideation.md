# /scene — Ideation

Condensed from brainstorming Q1–Q6. Each decision lists the chosen option, the alternatives rejected, and the **why** so future contributors don't relitigate.

## User story

> Wenxuan opens firefly-mesh dashboard for the first time after onboarding. She has 4 employees imported. Instead of a list view, she clicks **Scene** in the sidebar. The dashboard transforms into an isometric pixel office: 4 clickable characters in 2 department rooms, a CEO bulletin board, and ambient idle animations. She clicks her own character — the same `<AgentDetailDrawer>` she's seen on `/organization` slides in. Closes it. Switches to **A2A** view — a thread of 3 light trails arcs between Bob and Carol. Clicks one. The audit thread drawer she's seen on `/audit` opens. **One UI surface, three storytelling layers, every interaction reuses what already exists.**

## Q1 — Scope: which views

**Chosen: D — three layered views** (Org / Task / A2A).

| View | Camera | Story |
|---|---|---|
| **Org (default)** | Isometric, full-building, ~50% zoom | Where everyone is + how the org is structured |
| **Task** | Camera follows specific task lifecycle (sticky note flight) | A single task moving through people |
| **A2A** | Same as Org camera + overlay light trail layer | Real-time message flow |

**Rejected**:
- A only-Org → can't visualise task lifecycle or message flow → underuses the substrate
- B only-Task → boring at empty inbox (most users); needs Org context to interpret
- C only-A2A → too abstract without the people/rooms anchor

## Q2 — Integration: where does it live

**Chosen: D — embedded in firefly-mesh, no asset reuse.**

`packages/web/app/(dashboard)/scene/page.tsx` is a sibling of `/inbox`, `/audit` etc. Phaser bundle is dynamic-imported only when this route is loaded.

**Rejected**:
- A "embed but reuse `MultiAgent/web/public/theater/assets`" → assets are visually inconsistent (the explicit user complaint that started this project)
- B "rebuild MultiAgent's `/theater`" → wrong project; firefly-mesh users can't see it
- C "standalone marketing demo" → 90% of value is dashboard cohesion; a standalone demo loses that

## Q3 — Visual metaphor

**Chosen: A — isometric office building** (Stardew Valley + Two Point Hospital lineage).

- Isometric (2:1 dimetric, 30° elevation) so multiple rooms are visible simultaneously
- One floor, multiple rooms (CEO + Sales + Product + Common, expandable)
- Characters are 16-pixel-tall, 8-direction sprites
- Hallway connects rooms; A2A trails fly through hallway between rooms

**Rejected**:
- B "spaceship indicator (FTL)" — too sci-fi for a B2B office tool
- C "post-office / mail courier" — cute but only foregrounds A2A, hides the org structure
- D "railway dispatch (Mini Metro)" — task-centric, hides people

## Q4 — Visual style

**Chosen: A — Stardew Valley grade** (16×16 tile, 1px outline, ≤32-color palette, soft warm tones).

Detailed in `art/firefly-mesh-art-bible.md`.

**Rejected**:
- B Eastward (32×32 high-density) — 6-year team budget, not 1-person
- C Children of Morta (cinematic dark) — wrong vibe for warm collaboration tool
- D Owlboy/Sea of Stars (mid-density Square-Enix) — middle ground without distinct advantage; PixelLab's training distribution is biased toward Stardew, so QA pass rate is highest there

## Q5 — Engine

**Chosen: C — Phaser 3 with brand-new architecture** (no reuse of MultiAgent's old theater code).

- Phaser 3.80+ stable
- Strict file-size discipline (≤250 lines/scene, ≤200/system, ≤150/entity, ≤50 page mount)
- Single-active-scene model except A2AOverlay (which is intentionally additive)

**Rejected**:
- A reuse old theater architecture — `OfficeWorldScene.ts` is 771 lines; rejected as the very anti-pattern this project is correcting
- B Pixi.js v8 + custom — adds 700–1000 lines of infrastructure (camera, animation state machine, A* pathfinding, scene stack) that Phaser provides for free; the visual ceiling delta is ~1% under Stardew constraints
- D self-rolled engine (Eastward Cassette pattern) — month-of-engineering tax on a feature

## Q6 — Interaction depth

**Chosen: B — light-interactive, dashboard-augment view.**

- Click character → existing `<AgentDetailDrawer>`
- Click task sticky note → existing `<InboxDrawer>` (or hyperlink to `/inbox?focus=...`)
- Click A2A trail → existing `<ThreadDrawer>`
- All mutations stay in the dashboard's normal flow; the scene **never writes**

**Rejected**:
- A pure observatory — no interactivity = "looks cool but useless" (Stardew is barely playable in pure-observe mode either)
- C gameplay-rich (drag-to-reassign, in-pixel approve) — 2.5× engineering cost; introduces optimistic-UI / race / rollback complexity; not a demo's reasonable scope
- D standalone game — out of project boundary

## Methodology decisions (carried across all docs)

1. **Art Bible first**, asset production second. No PixelLab call until the bible is committed.
2. **Master style reference image** seeded once, then `reference_image` in every PixelLab call. Same view/palette/seed parameters across the entire production list.
3. **Auto QA gate** validates every asset before it's accepted into `public/scene/assets/`: palette quantization, dimensions, pivot point, transparency edges.
4. **Production list is YAML** — diff-able, reviewable, machine-readable. Every asset has an ID, a status, and a hash so re-renders are tracked.
5. **Cap V1 scope hard** — 4 characters × 4 directions × 2 animations + 4 rooms. Expand iteratively in V0.2/V0.3.
