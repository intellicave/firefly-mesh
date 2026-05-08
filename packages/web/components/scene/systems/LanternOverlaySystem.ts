// Engine-side lantern colour cycle per character state (design §2.1).
// In Phase 1 (placeholder sprites), emulates the lantern effect via tint cycling.
// In Phase 2+ (real sprites), this will tint only the ramp-3 pixel region using
// the `lantern_palette` from manifest + a RenderTexture pipeline.
//
// States:
//   idle  → light↔mid pulse (800ms half-cycle)
//   walk  → steady light (no pulse)
//   work  → dim + burst (3s cycle: 2s dim → 0.2s burst → 0.8s recovery)
//   talk  → double-pulse (400ms double blink)

import type { EmployeeEntity, CharState } from "../entities/EmployeeEntity";

// Ramp-3 (yellow lantern) hex colours from palette.mjs indices 12–15
const LANTERN_LIGHT = 0xf5e97a;
const LANTERN_MID = 0xc4a832;

interface LanternState {
  phase: number;
  timer: number;
}

export class LanternOverlaySystem {
  private states = new Map<string, LanternState>();
  private reducedMotion: boolean;

  constructor() {
    this.reducedMotion = typeof window !== "undefined"
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false;
  }

  register(entity: EmployeeEntity): void {
    this.states.set(entity.employeeId, { phase: 0, timer: 0 });
  }

  unregister(employeeId: string): void {
    this.states.delete(employeeId);
  }

  update(entities: Map<string, EmployeeEntity>, delta: number): void {
    if (this.reducedMotion) return;
    for (const [id, ls] of this.states) {
      const entity = entities.get(id);
      if (!entity) continue;
      ls.timer += delta;
      this.applyOverlay(entity, ls);
    }
  }

  private applyOverlay(entity: EmployeeEntity, ls: LanternState): void {
    const t = ls.timer;
    let tint: number;

    switch (entity.state) {
      case "idle": {
        // Light ↔ mid pulse at 800ms per half-cycle
        const p = (Math.sin(t / 800) + 1) / 2;
        tint = lerpColor(LANTERN_MID, LANTERN_LIGHT, p);
        break;
      }
      case "walk":
        tint = LANTERN_LIGHT;
        break;
      case "work": {
        // 3s cycle: 2s dim (mid) → 0.2s burst (light) → 0.8s recovery
        const cycle = t % 3000;
        tint = cycle < 2000 ? LANTERN_MID
          : cycle < 2200 ? LANTERN_LIGHT
          : lerpColor(LANTERN_LIGHT, LANTERN_MID, (cycle - 2200) / 800);
        break;
      }
      case "talk": {
        // Double-pulse at 400ms
        const cycle = t % 800;
        tint = cycle < 200 || (cycle > 400 && cycle < 600)
          ? LANTERN_LIGHT : LANTERN_MID;
        break;
      }
      default:
        tint = LANTERN_MID;
    }

    // Phase 1: apply as full-sprite tint (placeholder only)
    entity.sprite.setTint(tint);
  }
}

function lerpColor(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff, ag = (a >> 8) & 0xff, ab = a & 0xff;
  const br = (b >> 16) & 0xff, bg = (b >> 8) & 0xff, bb = b & 0xff;
  return ((Math.round(ar + (br - ar) * t) << 16)
    | (Math.round(ag + (bg - ag) * t) << 8)
    | Math.round(ab + (bb - ab) * t));
}
