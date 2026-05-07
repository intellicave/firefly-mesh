# firefly-mesh /scene — Project Meta

**Date opened**: 2026-05-07
**Owner**: Leooo-Huang (Cyberautonomy)
**Pipeline**: autodev-style (ideation → design → ui → api → plan → rules → index) augmented by **art bible + production pipeline + production list** because this project has heavy art-asset deliverables.

## Mission

Add a **Stardew-Valley-style pixel-game view** at `/scene` inside the firefly-mesh dashboard. The view visualises the user's real org as an isometric office building, with employees as pixel characters in their department rooms, A2A messages as flying light trails, and tasks as sticky notes that fan out from a CEO bulletin board. Subjects are bound to live firefly-mesh data via the existing REST API + SSE channels.

## Why

1. **Brand differentiator** — every B2B SaaS dashboard looks the same. A pixel "office" view is unique, screenshot-shareable, and reinforces the "Bring your own agent. We bring the org." pitch in a way no PRD can.
2. **Onboarding artefact** — new users see their first 4 employees and a few demo a2a flows in the pixel world; "I get it" happens in 10 seconds, not after reading 5 design docs.
3. **Production-quality test** — building this rigorously forces the project to have a real art bible, a real asset pipeline, and a real engine architecture. That work also unblocks future pixel features (V0.2 task playbook, V0.3 onboarding tour).

## Hard scope decisions (from brainstorming Q1–Q6)

| # | Decision | Recorded in |
|---|---|---|
| Q1 | **Three views** (Org / Task / A2A) layered, switchable | ideation.md |
| Q2 | **Embedded inside firefly-mesh** at `/scene`, no asset reuse from MultiAgent's `/theater` | ideation.md |
| Q3 | **Office-building metaphor** (Stardew + Two Point Hospital lineage) | ideation.md, art-bible.md |
| Q4 | **Stardew Valley visual style** (16×16 base, 1px outline, ≤32-color palette, isometric) | art-bible.md |
| Q5 | **Phaser 3.80+** with brand-new architecture (≤250 lines/file) | design.md |
| Q6 | **Light-interactive** (click character → existing dashboard drawer; no in-pixel mutations) | ui.md |
| methodology | **Art Bible + Pipeline + QA Gate** before any production asset is generated | art-bible.md, production-pipeline.md |

## Non-goals (write-down, prevents scope creep)

- ❌ No in-pixel mutations (no drag-to-reassign, no in-game approve). Operations remain in the dashboard.
- ❌ No multiplayer / collaborative cursor in pixel world.
- ❌ No standalone game / marketing demo split from firefly-mesh repo.
- ❌ No Eastward-level cinematic lighting / shaders. Stardew-grade polish is the bar.
- ❌ No reuse of MultiAgent's `theater` assets (rejected as "粗制滥造 + 视觉不一致").
- ❌ No reuse of MultiAgent's `theater` Phaser scene code (architectures has 771-line single-file scenes; we're not inheriting that debt).
- ❌ No Chinese-only or English-only — defer i18n to V0.2 (same pattern as the rest of the dashboard).

## Acceptance for "feature done"

The full feature is complete when **all of the following are simultaneously true**:

1. `/scene` route renders an isometric pixel office for the calling user's real org, with each active employee as a clickable character placed in their department room.
2. The three views (Org / Task / A2A) are switchable from a toolbar; switching is animated (camera + scene composition), not a hard cut.
3. Clicking an employee opens the existing `<AgentDetailDrawer>` with that employee's data.
4. Clicking an A2A light trail opens the existing `<ThreadDrawer>` with that thread.
5. Clicking a task sticky note opens the existing `<InboxDrawer>` with that task or jumps to `/inbox?focus={id}`.
6. SSE events (a2a.created / task.dispatched / audit.entry.appended) trigger live in-scene animations (light trail, sticky-note flight, archive shimmer).
7. All assets pass automated QA gate (palette, size, pivot, transparency).
8. `pnpm typecheck` clean across all 5 packages.
9. Bundle delta on routes other than `/scene` is **0** (verified by `next build` chunk analysis).
10. README has a 1-paragraph "Scene view" callout with a screenshot.

## Risk register (carried into plan.md as concrete tasks)

| # | Risk | Mitigation |
|---|---|---|
| R1 | PixelLab outputs are visually inconsistent across calls (same problem that broke the old theater) | Master `style-reference.png` + identical view/palette/seed parameters per asset class + reject-and-regenerate gate |
| R2 | Phaser scene file grows past 250 lines repeating old theater's mistake | Hard ESLint rule on max-lines for `components/scene/scene/*.ts` |
| R3 | Bundle bloat creeps onto non-`/scene` routes | Bundle analyzer in CI, alarm if any common chunk grows |
| R4 | Animation handcraft cost explodes (16 chars × 8 dirs × 4 anims = 512 frames) | Cap V1 to 4 chars × 4 dirs × 2 anims = 32 frames; expand iteratively |
| R5 | Real-time SSE → scene desync (race conditions, ghosts) | Single-source-of-truth invariant: tanstack-query is canonical, scene is derived view; reconcile every 5s as backstop |
| R6 | Render perf <60 fps on low-end laptops | Target: 4-departments / 16-employees / 8-active-a2a-lines @ 60fps on a 2020 MacBook Air. Profile with Chrome DevTools each milestone. |

## Document map

| File | Purpose | Status |
|---|---|---|
| `2026-05-07-firefly-mesh-scene-meta.md` (this) | Mission + scope + acceptance + risk register | ✅ |
| `2026-05-07-firefly-mesh-scene-ideation.md` | Q1–Q6 decisions condensed + alternatives rejected | pending |
| `2026-05-07-firefly-mesh-scene-design.md` | Architecture, 3 views, data flow, dir layout | pending |
| `2026-05-07-firefly-mesh-scene-ui.md` | View toggle UX, drawer integration, scene UX flows | pending |
| `2026-05-07-firefly-mesh-scene-api.md` | Consumed firefly-mesh API + SceneEventBus protocol | pending |
| `art/firefly-mesh-art-bible.md` | Palette / tile / view / shading / anim rules | pending |
| `art/production-pipeline.md` | PixelLab → QA gate → sprite atlas build sequence | pending |
| `art/production-list.yaml` | Every asset ID / source prompt / dependencies / status | pending |
| `2026-05-07-firefly-mesh-scene-plan.md` | Phase milestones + acceptance criteria per task | pending |
| `2026-05-07-firefly-mesh-scene-rules.md` | Engineering red lines (file size, asset QA gate, single-source) | pending |
| `2026-05-07-firefly-mesh-scene-index.md` | Code map + cross-references | pending |
