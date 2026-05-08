// Animation state machine for EmployeeEntity.
// Phase 1: placeholder sprites have no real animation frames, so this system
// manages state transitions and is ready to wire real anims when sprites ship.

import type { EmployeeEntity, CharState, FacingDir } from "../entities/EmployeeEntity";

// Valid state transitions
const TRANSITIONS: Record<CharState, CharState[]> = {
  idle: ["walk", "work", "talk"],
  walk: ["idle"],
  work: ["idle", "talk"],
  talk: ["idle", "work"],
};

export class AnimationSystem {
  private entities = new Map<string, EmployeeEntity>();

  register(entity: EmployeeEntity): void {
    this.entities.set(entity.employeeId, entity);
  }

  unregister(employeeId: string): void {
    this.entities.delete(employeeId);
  }

  /** Request a state transition; ignored if not a valid transition. */
  transition(employeeId: string, nextState: CharState): boolean {
    const entity = this.entities.get(employeeId);
    if (!entity) return false;
    if (!TRANSITIONS[entity.state].includes(nextState)) return false;
    entity.setState(nextState);
    this.applyAnim(entity);
    return true;
  }

  setFacing(employeeId: string, dir: FacingDir): void {
    const entity = this.entities.get(employeeId);
    if (!entity) return;
    entity.facing = dir;
    this.applyAnim(entity);
  }

  private applyAnim(entity: EmployeeEntity): void {
    // Phase 1: no real sprite sheet yet; tint sprite to indicate state
    const tints: Record<CharState, number> = {
      idle: 0xffffff,
      walk: 0xaaddff,
      work: 0xffeeaa,
      talk: 0xaaffaa,
    };
    entity.sprite.setTint(tints[entity.state]);
  }

  /** Called every frame by OrgScene.update(); updates placeholder tint state. */
  update(_time: number, _delta: number): void {
    // Real sprite animation playback wired here when frames are available (Phase 2).
  }
}
